// swift-tools-version: 6.0
import PackageDescription

var products: [Product] = [.library(name: "CohubCore", targets: ["CohubCore"])]
var dependencies: [Package.Dependency] = []
var targets: [Target] = [
    .target(name: "CohubCore"),
    .testTarget(name: "CohubCoreTests", dependencies: ["CohubCore"]),
]

#if os(macOS)
products.append(.executable(name: "Cohub", targets: ["Cohub"]))
dependencies.append(.package(url: "https://github.com/sparkle-project/Sparkle", from: "2.10.1"))
targets.append(
    .executableTarget(
        name: "Cohub",
        dependencies: ["CohubCore", .product(name: "Sparkle", package: "Sparkle")],
        linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]
    )
)
#endif

let package = Package(
    name: "Cohub",
    platforms: [.macOS(.v13)],
    products: products,
    dependencies: dependencies,
    targets: targets
)
