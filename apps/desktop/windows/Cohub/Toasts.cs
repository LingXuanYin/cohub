using System.Security.Cryptography;
using System.Text;
using CommunityToolkit.WinUI.Notifications;
using Windows.UI.Notifications;

namespace Cohub;

internal sealed class Toasts
{
    public Toasts(Action<string> open) =>
        ToastNotificationManagerCompat.OnActivated += activation =>
        {
            if (ToastArguments.Parse(activation.Argument).TryGetValue("path", out var path)) open(path);
        };

    public static bool Enabled => ToastNotificationManagerCompat.CreateToastNotifier().Setting == NotificationSetting.Enabled;

    public static bool Show(string id, string title, string? body, string path)
    {
        var builder = new ToastContentBuilder().AddArgument("path", path).AddText(title);
        if (!string.IsNullOrWhiteSpace(body)) builder.AddText(body);
        builder.Show(toast => toast.Tag = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id)))[..32]);
        return Enabled;
    }

    public static void Uninstall() => ToastNotificationManagerCompat.Uninstall();
}
