import Foundation
import Testing
@testable import CohubCore

@Suite struct HostProtocolTests {
    let manifest = JSON.parse(try! Data(contentsOf: URL(fileURLWithPath: #filePath)
        .appendingPathComponent("../../../../../../packages/protocol/host-bridge.json").standardizedFileURL))!

    func names(_ key: String) -> Set<String> { Set(manifest[key]?.array?.compactMap(\.string) ?? []) }

    @Test func constantsMatchTheProtocolPackage() {
        #expect(manifest["global"]?.string == HostProtocol.global)
        #expect(manifest["version"] == .number(Double(HostProtocol.version)))
        #expect(manifest["service"]?["version"] == .number(Double(HostProtocol.serviceVersion)))
        #expect(manifest["service"]?["shellEvents"]?.array?.compactMap(\.string) == [HostProtocol.ShellEvent.open])
    }

    @Test func everyNameIsKnownToTheWebSide() {
        let C = HostProtocol.Capability.self, M = HostProtocol.Method.self, E = HostProtocol.Event.self, R = HostProtocol.ErrorCode.self
        #expect(Set([C.notifications, C.share, C.navigation, C.cache, C.appearance, C.launch, C.files, C.shortcuts, C.mediaCapture, C.runtime, C.runtimePicker]).isSubset(of: names("capabilities")))
        #expect(Set([M.describe, M.appReady, M.appearanceSet, M.navigationOpenPath, M.shareText, M.filesSave, M.cacheClear, M.notificationsRegister, M.notificationsShow, M.shortcutsPush, M.runtimeList, M.runtimeBrowse, M.runtimeStart, M.runtimeStop, M.runtimePickFolder]).isSubset(of: names("methods")))
        #expect(Set([E.authChanged, E.runtimeChanged]).isSubset(of: names("events")))
        #expect(Set([R.unsupported, R.canceled, R.failed]).isSubset(of: names("errors")))
    }
}
