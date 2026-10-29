using System.Globalization;
using System.Resources;

namespace Cohub;

internal static class Strings
{
    private static readonly ResourceManager Resources = new("Cohub.Strings", typeof(Strings).Assembly);

    public static string L(string key) => Resources.GetString(key, CultureInfo.CurrentUICulture) ?? key;

    public static string Format(string key, params object[] values) => string.Format(CultureInfo.CurrentCulture, L(key), values);
}
