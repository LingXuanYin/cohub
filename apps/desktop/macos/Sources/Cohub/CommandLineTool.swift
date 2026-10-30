import AppKit

@MainActor
enum CommandLineTool {
    static let link = URL(fileURLWithPath: "/usr/local/bin/cohub")

    static func install(_ tool: URL?) {
        guard let tool, FileManager.default.fileExists(atPath: tool.path) else {
            return inform(L("This build has no command line tool."), L("Install it with npm install -g @neta-art/cohub-cli."))
        }
        let current = try? FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        if current == tool.path {
            return inform(L("The cohub command is installed."), L("Run cohub in a terminal to use it."))
        }
        if FileManager.default.fileExists(atPath: link.path) || current != nil {
            let alert = NSAlert()
            alert.messageText = L("Replace the existing cohub command?")
            alert.informativeText = L("\(link.path) already exists, for example from npm. Cohub will link it to the version inside this app.")
            alert.addButton(withTitle: L("Replace"))
            alert.addButton(withTitle: L("Cancel"))
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        do {
            try replaceLink(to: tool)
        } catch {
            let command = "mkdir -p /usr/local/bin && ln -sfn \(quoted(tool.path)) \(quoted(link.path))"
            let script = NSAppleScript(source: "do shell script \"\(command.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\" with administrator privileges")
            var failure: NSDictionary?
            _ = script?.executeAndReturnError(&failure)
            if failure != nil { return }
        }
        inform(L("The cohub command is installed."), L("Run cohub in a terminal to use it."))
    }

    private static func replaceLink(to tool: URL) throws {
        let manager = FileManager.default
        try manager.createDirectory(at: link.deletingLastPathComponent(), withIntermediateDirectories: true)
        if (try? manager.destinationOfSymbolicLink(atPath: link.path)) != nil || manager.fileExists(atPath: link.path) {
            try manager.removeItem(at: link)
        }
        try manager.createSymbolicLink(at: link, withDestinationURL: tool)
    }

    private static func quoted(_ path: String) -> String {
        "'\(path.replacingOccurrences(of: "'", with: "'\\''"))'"
    }

    private static func inform(_ message: String, _ detail: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        alert.runModal()
    }
}
