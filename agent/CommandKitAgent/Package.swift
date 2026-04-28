// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "CommandKitAgent",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "CommandKitAgent",
            dependencies: [],
            path: "Sources"
        )
    ]
)
