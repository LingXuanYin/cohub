public struct RuntimeOverview: Equatable, Sendable {
    public enum State: String, Sendable {
        case stopped, connecting, ready, error
    }

    public struct Folder: Equatable, Sendable {
        public let spaceId: String
        public let root: String
        public let label: String
        public let state: State

        public var name: String {
            let trimmed = root.hasSuffix("/") || root.hasSuffix("\\") ? String(root.dropLast()) : root
            return trimmed.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? root
        }
    }

    public let folders: [Folder]

    public init(folders: [Folder] = []) {
        self.folders = folders
    }

    public init?(_ runtime: JSON) {
        guard let instances = runtime["instances"]?.array else { return nil }
        folders = instances.compactMap { item in
            guard let spaceId = item["spaceId"]?.string, let root = item["root"]?.string else { return nil }
            return Folder(spaceId: spaceId, root: root, label: item["label"]?.string ?? root, state: State(rawValue: item["state"]?.string ?? "") ?? .error)
        }
    }

    public var connected: [Folder] { folders.filter { $0.state != .stopped } }

    public var summary: State? {
        let states = Set(connected.map(\.state))
        if states.contains(.error) { return .error }
        if states.contains(.connecting) { return .connecting }
        return states.isEmpty ? nil : .ready
    }
}
