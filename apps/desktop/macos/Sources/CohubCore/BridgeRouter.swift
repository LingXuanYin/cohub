@MainActor
public final class BridgeRouter {
    public typealias Handler = @MainActor (JSON) async throws -> JSON
    public typealias Consent = @MainActor (_ root: String, _ spaceId: String) async -> Bool

    static let describeWait: Duration = .milliseconds(1_500)

    private let platform: String
    private let hostId: String
    private let capabilities: [String]
    private let handlers: [String: Handler]
    private let service: HostService?
    private let consent: Consent
    private let send: @MainActor (String) -> Void
    public private(set) var describedWithoutService = false

    public init(
        platform: String,
        hostId: String,
        capabilities: [String],
        handlers: [String: Handler],
        service: HostService?,
        consent: @escaping Consent,
        send: @escaping @MainActor (String) -> Void
    ) {
        self.platform = platform
        self.hostId = hostId
        self.capabilities = capabilities
        self.handlers = handlers
        self.service = service
        self.consent = consent
        self.send = send
    }

    public func receive(_ text: String) {
        guard let request = BridgeRequest.parse(text) else { return }
        Task { send(await reply(to: request).text(id: request.id)) }
    }

    public func emit(_ name: String, _ payload: JSON? = nil) {
        send(BridgeEvent.text(name: name, payload: payload))
    }

    private func reply(to request: BridgeRequest) async -> BridgeReply {
        if request.method == HostProtocol.Method.describe { return .result(await describe()) }
        if let handler = handlers[request.method] {
            do { return .result(try await handler(request.params)) }
            catch let failure as BridgeFailure { return .failure(failure) }
            catch { return .failure(.failed(String(describing: error))) }
        }
        guard let service, await serviceHello()?.methods.contains(request.method) == true else { return .failure(.unsupported(request.method)) }
        if request.method == HostProtocol.Method.runtimeStart, !(await consented(to: request, service: service)) {
            return .failure(.canceled("Not connected"))
        }
        return await service.call(request)
    }

    private func serviceHello() async -> ServiceHello? {
        guard let service else { return nil }
        if let hello = service.hello { return hello }
        return await service.ready(timeout: Self.describeWait)
    }

    private func describe() async -> JSON {
        let hello = await serviceHello()
        describedWithoutService = service != nil && hello == nil
        var advertised = capabilities
        for capability in hello?.capabilities ?? [] where !advertised.contains(capability) { advertised.append(capability) }
        return [
            "version": .number(Double(HostProtocol.version)),
            "platform": .string(platform),
            "hostId": .string(hostId),
            "capabilities": .array(advertised.map(JSON.string)),
        ]
    }

    private func consented(to request: BridgeRequest, service: HostService) async -> Bool {
        guard let root = request.params["root"]?.string, let spaceId = request.params["spaceId"]?.string else { return true }
        if case .result(let runtime) = await service.call(BridgeRequest(id: "list", method: HostProtocol.Method.runtimeList)),
           runtime["instances"]?.array?.contains(where: { $0["spaceId"]?.string == spaceId && $0["root"]?.string == root }) == true {
            return true
        }
        return await consent(root, spaceId)
    }
}
