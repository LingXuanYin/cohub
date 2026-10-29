using System.Text.Json.Nodes;

namespace Cohub.Core;

public sealed record RuntimeOverview(IReadOnlyList<RuntimeOverview.Folder> Folders)
{
    public enum State { Stopped, Connecting, Ready, Error }

    public sealed record Folder(string SpaceId, string Root, string Label, State State)
    {
        public string Name => Root.TrimEnd('/', '\\').Split('/', '\\').LastOrDefault(part => part.Length > 0) ?? Root;
    }

    public static readonly RuntimeOverview Empty = new([]);

    public static RuntimeOverview? From(JsonNode? runtime)
    {
        if (runtime is not JsonObject { } fields || fields["instances"] is not JsonArray instances) return null;
        var folders = instances
            .Select(item => (SpaceId: JsonFields.Text(item, "spaceId"), Root: JsonFields.Text(item, "root"), Item: item))
            .Where(item => item.SpaceId is not null && item.Root is not null)
            .Select(item => new Folder(item.SpaceId!, item.Root!, JsonFields.Text(item.Item, "label") ?? item.Root!, ParseState(JsonFields.Text(item.Item, "state"))))
            .ToList();
        return new RuntimeOverview(folders);
    }

    private static State ParseState(string? state) => state switch
    {
        "stopped" => State.Stopped,
        "connecting" => State.Connecting,
        "ready" => State.Ready,
        _ => State.Error,
    };

    public IReadOnlyList<Folder> Connected => [.. Folders.Where(folder => folder.State != State.Stopped)];

    public State? Summary
    {
        get
        {
            var states = Connected.Select(folder => folder.State).ToHashSet();
            if (states.Contains(State.Error)) return State.Error;
            if (states.Contains(State.Connecting)) return State.Connecting;
            return states.Count == 0 ? null : State.Ready;
        }
    }

    public bool Equals(RuntimeOverview? other) => other is not null && Folders.SequenceEqual(other.Folders);

    public override int GetHashCode() => Folders.Aggregate(0, (hash, folder) => HashCode.Combine(hash, folder));
}
