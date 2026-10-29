import AppKit
import CohubCore
import UserNotifications

@MainActor
final class Notifications: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let open: @MainActor (String) -> Void

    init(open: @escaping @MainActor (String) -> Void) {
        self.open = open
        super.init()
        center.delegate = self
    }

    func register() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func show(_ params: JSON) async throws -> Bool {
        guard let id = params["id"]?.string, let title = params["title"]?.string,
              let path = params["path"]?.string, WebOrigin.isInAppPath(path)
        else { throw BridgeFailure.failed("notifications.show requires an id, a title and an in-app path") }
        switch await center.notificationSettings().authorizationStatus {
        case .authorized, .provisional: break
        case .notDetermined: guard await register() else { return false }
        default: return false
        }
        let content = UNMutableNotificationContent()
        content.title = title
        if let body = params["body"]?.string { content.body = body }
        content.sound = .default
        content.userInfo = ["path": path]
        try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
        return true
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["path"] as? String else { return }
        await MainActor.run { open(path) }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}
