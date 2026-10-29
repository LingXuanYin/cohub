using Velopack;
using Velopack.Sources;

namespace Cohub;

internal sealed class Updates(string feed, Action ready, Action<string> log)
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private readonly UpdateManager manager = new(new SimpleWebSource(feed));
    private UpdateInfo? downloaded;

    public bool Ready => downloaded is not null;

    public async Task RunAsync(CancellationToken stopping)
    {
        if (!manager.IsInstalled) return;
        while (!stopping.IsCancellationRequested && downloaded is null)
        {
            try
            {
                if (await manager.CheckForUpdatesAsync() is { } update)
                {
                    await manager.DownloadUpdatesAsync(update, cancelToken: stopping);
                    downloaded = update;
                    ready();
                    return;
                }
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                log($"Update check failed: {error.Message}");
            }
            try { await Task.Delay(Interval, stopping); } catch (OperationCanceledException) { return; }
        }
    }

    public void RestartNow()
    {
        if (downloaded is not null) manager.ApplyUpdatesAndRestart(downloaded.TargetFullRelease);
    }

    public void ApplyOnExit()
    {
        if (downloaded is not null) manager.WaitExitThenApplyUpdates(downloaded.TargetFullRelease, silent: true, restart: false);
    }
}
