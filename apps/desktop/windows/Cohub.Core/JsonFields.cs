using System.Text.Json;
using System.Text.Json.Nodes;

namespace Cohub.Core;

public static class JsonFields
{
    public static string? Text(JsonNode? node) => node?.GetValueKind() == JsonValueKind.String ? (string?)node : null;

    public static string? Text(JsonNode? node, string key) => node is JsonObject fields ? Text(fields[key]) : null;

    public static bool? Bool(JsonNode? node, string key) => node is JsonObject fields && fields[key]?.GetValueKind() is JsonValueKind.True or JsonValueKind.False ? (bool)fields[key]! : null;
}
