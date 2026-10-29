using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Cohub.Core;

public sealed record ServiceHello(IReadOnlyList<string> Capabilities, IReadOnlyList<string> Methods);

public sealed class HostService(
    Func<HostService.Launch> launch,
    ServiceHello? known,
    Action<string, JsonNode?> onEvent,
    Action<ServiceHello>? onHello = null,
    Action<string>? log = null) : IDisposable
{
    public sealed record Launch(string Executable, IReadOnlyList<string> Arguments, IReadOnlyDictionary<string, string> Environment);

    public HostService(Launch launch, ServiceHello? known, Action<string, JsonNode?> onEvent, Action<ServiceHello>? onHello = null, Action<string>? log = null)
        : this(() => launch, known, onEvent, onHello, log) { }

    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);
    private readonly Func<Launch> launchProvider = launch;
    private readonly Lock gate = new();
    private readonly SemaphoreSlim writing = new(1, 1);
    private readonly Dictionary<string, TaskCompletionSource<BridgeReply>> pending = [];
    private TaskCompletionSource<ServiceHello> ready = NewReady();
    private Process? process;
    private ServiceHello? live;
    private ServiceHello? known = known;
    private int sequence;
    private int restarts;
    private bool stopped;

    private static TaskCompletionSource<ServiceHello> NewReady() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    public ServiceHello? Hello { get { lock (gate) return live ?? known; } }

    public void Start()
    {
        lock (gate) stopped = false;
        _ = Task.Run(Spawn);
    }

    public void Stop()
    {
        Process? current;
        lock (gate)
        {
            stopped = true;
            current = process;
        }
        try { current?.StandardInput.Close(); } catch (InvalidOperationException) { } catch (IOException) { }
    }

    public void Dispose()
    {
        Stop();
        writing.Dispose();
    }

    public async Task<ServiceHello?> ReadyAsync(TimeSpan timeout)
    {
        Task<ServiceHello> task;
        lock (gate) task = ready.Task;
        try { return await task.WaitAsync(timeout).ConfigureAwait(false); }
        catch (TimeoutException) { return null; }
    }

    public async Task<BridgeReply> CallAsync(BridgeRequest request)
    {
        if (await ReadyAsync(TimeSpan.FromSeconds(20)).ConfigureAwait(false) is null)
            return BridgeReply.Fail(BridgeException.Failed("The Cohub CLI is not running"));
        var reply = new TaskCompletionSource<BridgeReply>(TaskCreationOptions.RunContinuationsAsynchronously);
        string id;
        Process? current;
        lock (gate)
        {
            id = $"s{++sequence}";
            pending[id] = reply;
            current = process;
        }
        await writing.WaitAsync().ConfigureAwait(false);
        try
        {
            if (current is null) throw new IOException("The Cohub CLI is not running");
            await current.StandardInput.WriteAsync(request.ToJson(id) + "\n").ConfigureAwait(false);
            await current.StandardInput.FlushAsync().ConfigureAwait(false);
        }
        catch (Exception error) when (error is IOException or InvalidOperationException or ObjectDisposedException)
        {
            Resolve(id, BridgeReply.Fail(BridgeException.Failed("The Cohub CLI is not reachable")));
        }
        finally
        {
            writing.Release();
        }
        return await reply.Task.ConfigureAwait(false);
    }

    private void Spawn()
    {
        Launch launch;
        try { launch = launchProvider(); }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            log?.Invoke($"Cohub CLI is not ready: {error.Message}");
            ScheduleRestart();
            return;
        }
        var info = new ProcessStartInfo(launch.Executable)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = Utf8,
            StandardOutputEncoding = Utf8,
            StandardErrorEncoding = Utf8,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in launch.Arguments) info.ArgumentList.Add(argument);
        info.Environment.Clear();
        foreach (var (key, value) in launch.Environment) info.Environment[key] = value;

        var child = new Process { StartInfo = info, EnableRaisingEvents = true };
        child.ErrorDataReceived += (_, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) log?.Invoke(e.Data); };
        try
        {
            child.Start();
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException or FileNotFoundException)
        {
            log?.Invoke($"Cohub CLI did not start: {error.Message}");
            child.Dispose();
            ScheduleRestart();
            return;
        }
        child.StandardInput.AutoFlush = false;
        child.BeginErrorReadLine();
        lock (gate) process = child;
        _ = Task.Run(() => ReadAsync(child));
    }

    private async Task ReadAsync(Process child)
    {
        try
        {
            while (await child.StandardOutput.ReadLineAsync().ConfigureAwait(false) is { } line) Handle(line);
        }
        catch (IOException) { }
        await child.WaitForExitAsync().ConfigureAwait(false);
        List<TaskCompletionSource<BridgeReply>> failed;
        lock (gate)
        {
            if (process != child) return;
            process = null;
            live = null;
            if (ready.Task.IsCompleted) ready = NewReady();
            failed = [.. pending.Values];
            pending.Clear();
        }
        foreach (var reply in failed) reply.TrySetResult(BridgeReply.Fail(BridgeException.Failed("The Cohub CLI stopped")));
        log?.Invoke($"Cohub CLI exited ({child.ExitCode})");
        child.Dispose();
        ScheduleRestart();
    }

    private void ScheduleRestart()
    {
        int delay;
        lock (gate)
        {
            if (stopped) return;
            restarts++;
            delay = (int)Math.Min(30, Math.Pow(2, Math.Min(restarts, 5) - 1));
        }
        _ = Task.Delay(TimeSpan.FromSeconds(delay)).ContinueWith(_ =>
        {
            bool skip;
            lock (gate) skip = stopped;
            if (!skip) Spawn();
        }, TaskScheduler.Default);
    }

    private void Handle(string line)
    {
        JsonObject? message;
        try { message = JsonNode.Parse(line) as JsonObject; }
        catch (JsonException) { return; }
        if (message is null) return;
        switch (JsonFields.Text(message["type"]))
        {
            case "hello":
                if (message["methods"] is not JsonArray methods || message["capabilities"] is not JsonArray capabilities) return;
                var hello = new ServiceHello([.. capabilities.Select(JsonFields.Text).OfType<string>()], [.. methods.Select(JsonFields.Text).OfType<string>()]);
                TaskCompletionSource<ServiceHello> resolved;
                lock (gate)
                {
                    live = hello;
                    known = hello;
                    restarts = 0;
                    resolved = ready;
                }
                resolved.TrySetResult(hello);
                onHello?.Invoke(hello);
                break;
            case "response":
                if (JsonFields.Text(message["id"]) is not { } id) return;
                Resolve(id, message["error"] is JsonObject error
                    ? BridgeReply.Fail(new BridgeException(JsonFields.Text(error["code"]) ?? HostProtocol.ErrorCodes.Failed, JsonFields.Text(error["message"]) ?? "Host call failed"))
                    : BridgeReply.Success(message["result"]?.DeepClone()));
                break;
            case "event":
                if (JsonFields.Text(message["name"]) is { } name) onEvent(name, message["payload"]?.DeepClone());
                break;
        }
    }

    private void Resolve(string id, BridgeReply reply)
    {
        TaskCompletionSource<BridgeReply>? waiting;
        lock (gate)
        {
            if (!pending.Remove(id, out waiting)) return;
        }
        waiting.TrySetResult(reply);
    }
}
