import Foundation
import IOKit
import SystemConfiguration

// MARK: - Collected Device Info

struct DeviceInfoSnapshot {
    var serialNumber: String = "Unknown"
    var hardwareModel: String = "Unknown"
    var osVersion: String = "Unknown"
    var cpuType: String = "Unknown"
    var deviceUUID: String = "Unknown"
    var totalStorageGB: Double = 0.0
    var usedStorageGB: Double = 0.0
    var batteryHealth: Int? = nil
    var batteryCycleCount: Int? = nil
    var fileVaultEnabled: Bool? = nil
    var firewallEnabled: Bool? = nil
    var passwordPolicyCompliant: Bool? = nil
    var installedApps: [String] = []
}

// MARK: - DeviceInfo Collector

class DeviceInfo {

    /// Collect all device information, continuing on non-fatal errors.
    func collect() -> DeviceInfoSnapshot {
        var info = DeviceInfoSnapshot()

        // Hardware identifiers (IOKit).
        info.serialNumber = readSerialNumber()
        info.deviceUUID = readDeviceUUID()
        info.hardwareModel = readHardwareModel()
        info.cpuType = readCPUType()

        // OS version.
        info.osVersion = readOSVersion()

        // Storage.
        let storage = readStorageInfo()
        info.totalStorageGB = storage.totalGB
        info.usedStorageGB = storage.usedGB

        // Battery (IOKit AppleSmartBattery).
        let battery = readBatteryInfo()
        info.batteryHealth = battery.health
        info.batteryCycleCount = battery.cycleCount

        // Security posture.
        info.fileVaultEnabled = readFileVaultStatus()
        info.firewallEnabled = readFirewallStatus()
        info.passwordPolicyCompliant = readPasswordPolicyCompliance()

        // Installed applications.
        info.installedApps = scanInstalledApplications()

        return info
    }

    // MARK: - IOKit Helpers

    /// Create an IOKit main port for IOKit queries.
    private func getIOKitMainPort() -> mach_port_t? {
        var mainPort: mach_port_t = 0
        let result = IOMainPort(kIOMainPortDefault, &mainPort)
        guard result == kIOReturnSuccess else {
            logError("Failed to get IOKit main port: \(result)")
            return nil
        }
        return mainPort
    }

    /// Read a string property from an IOKit registry entry.
    private func ioRegistryString(property: String, service: String) -> String? {
        guard let mainPort = getIOKitMainPort() else { return nil }

        let serviceIterator = IOServiceGetMatchingService(mainPort, IOServiceMatching(service))
        guard serviceIterator != 0 else {
            IOObjectRelease(serviceIterator)
            return nil
        }
        defer { IOObjectRelease(serviceIterator) }

        let propertyRef = IORegistryEntryCreateCFProperty(
            serviceIterator,
            property as CFString,
            kCFAllocatorDefault,
            0
        )
        guard let valueRef = propertyRef else { return nil }
        defer { CFRelease(valueRef) }

        if let data = valueRef.takeUnretainedValue() as? Data {
            // Some IOKit properties are returned as raw bytes (null-terminated C strings).
            return String(data: data.dropLast(), encoding: .utf8)
        } else if let str = valueRef.takeUnretainedValue() as? String {
            return str
        } else if let cfStr = valueRef.takeUnretainedValue() as? CFString {
            return cfStr as String
        }
        return nil
    }

    /// Read an integer property from an IOKit registry entry.
    private func ioRegistryInteger(property: String, service: String) -> Int? {
        guard let mainPort = getIOKitMainPort() else { return nil }

        let serviceIterator = IOServiceGetMatchingService(mainPort, IOServiceMatching(service))
        guard serviceIterator != 0 else {
            IOObjectRelease(serviceIterator)
            return nil
        }
        defer { IOObjectRelease(serviceIterator) }

        let propertyRef = IORegistryEntryCreateCFProperty(
            serviceIterator,
            property as CFString,
            kCFAllocatorDefault,
            0
        )
        guard let valueRef = propertyRef else { return nil }
        defer { CFRelease(valueRef) }

        if let num = valueRef.takeUnretainedValue() as? Int {
            return num
        } else if let num = valueRef.takeUnretainedValue() as? UInt64 {
            return Int(num)
        }
        return nil
    }

    // MARK: - Serial Number

    private func readSerialNumber() -> String {
        // IOPlatformSerialNumber from IOPlatformExpertDevice
        if let serial = ioRegistryString(property: "IOPlatformSerialNumber", service: "IOPlatformExpertDevice") {
            return serial
        }
        logWarn("Could not read serial number from IOKit.")
        return "Unknown"
    }

    // MARK: - Device UUID

    private func readDeviceUUID() -> String {
        if let uuid = ioRegistryString(property: "IOPlatformUUID", service: "IOPlatformExpertDevice") {
            return uuid
        }
        logWarn("Could not read device UUID from IOKit.")
        return "Unknown"
    }

    // MARK: - Hardware Model

    private func readHardwareModel() -> String {
        // Try IOKit first (hw.model equivalent).
        if let model = ioRegistryString(property: "model", service: "IOPlatformExpertDevice") {
            return model.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Fallback: sysctl hw.model
        if let model = sysctlString("hw.model") {
            return model
        }
        logWarn("Could not read hardware model.")
        return "Unknown"
    }

    // MARK: - CPU Type

    private func readCPUType() -> String {
        // On Apple Silicon, hw.optional.arm64 exists and is > 0.
        if let arm64 = sysctlInteger("hw.optional.arm64"), arm64 > 0 {
            return "Apple Silicon"
        }
        // On Intel, hw.optional.arm64 does not exist or is 0.
        // Also check hw.cputype for Intel (CPU_TYPE_X86_64 = 0x01000007).
        if let cpuType = sysctlInteger("hw.cputype") {
            // x86_64 is 0x01000007 = 16777223
            if cpuType == 16777223 {
                return "Intel"
            }
        }
        return "Unknown"
    }

    // MARK: - OS Version

    private func readOSVersion() -> String {
        // Use Process to call sw_vers for reliability.
        let output = runProcess(launchPath: "/usr/bin/sw_vers", arguments: ["-productVersion"])
        let version = output.trimmingCharacters(in: .whitespacesAndNewlines)
        return version.isEmpty ? "Unknown" : version
    }

    // MARK: - Storage

    private struct StorageInfo {
        let totalGB: Double
        let usedGB: Double
    }

    private func readStorageInfo() -> StorageInfo {
        do {
            let homeURL = URL(fileURLWithPath: "/")
            let values = try homeURL.resourceValues(forKeys: [
                .volumeTotalCapacityKey,
                .volumeAvailableCapacityForImportantUsageKey
            ])

            let total = Double(values.volumeTotalCapacity ?? 0) / 1_073_741_824.0  // bytes to GB
            let available = Double(values.volumeAvailableCapacityForImportantUsage ?? 0) / 1_073_741_824.0
            let used = total - available

            return StorageInfo(totalGB: total, usedGB: used)
        } catch {
            logWarn("Could not read storage info: \(error.localizedDescription)")
            return StorageInfo(totalGB: 0, usedGB: 0)
        }
    }

    // MARK: - Battery

    private struct BatteryInfo {
        let health: Int?
        let cycleCount: Int?
    }

    private func readBatteryInfo() -> BatteryInfo {
        // Desktop Macs have no battery.
        var health: Int?
        var cycleCount: Int?

        // AppleSmartBattery via IOKit.
        if let h = ioRegistryInteger(property: "AppleSmartBatteryMaxCapacity", service: "AppleSmartBattery"),
           let current = ioRegistryInteger(property: "AppleSmartBatteryCurrentCapacity", service: "AppleSmartBattery"),
           h > 0 {
            health = Int(Double(current) / Double(h) * 100.0)
        }
        cycleCount = ioRegistryInteger(property: "CycleCount", service: "AppleSmartBattery")

        return BatteryInfo(health: health, cycleCount: cycleCount)
    }

    // MARK: - FileVault

    private func readFileVaultStatus() -> Bool? {
        let output = runProcess(launchPath: "/usr/bin/fdesetup", arguments: ["status"])
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("FileVault is On.") {
            return true
        } else if trimmed.hasPrefix("FileVault is Off.") {
            return false
        }
        logWarn("Could not determine FileVault status: \(trimmed)")
        return nil
    }

    // MARK: - Firewall

    private func readFirewallStatus() -> Bool? {
        let output = runProcess(launchPath: "/usr/libexec/ApplicationFirewall/socketfilterfw", arguments: ["--getglobalstate"])
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.contains("enabled") {
            return true
        } else if trimmed.contains("disabled") {
            return false
        }
        logWarn("Could not determine firewall status: \(trimmed)")
        return nil
    }

    // MARK: - Password Policy

    private func readPasswordPolicyCompliance() -> Bool? {
        // Check if any local user has a password set using dscl.
        // We attempt to read the authentication authority; if it exists the user has a password.
        let output = runProcess(launchPath: "/usr/bin/dscl", arguments: [".", "-read", "/Local/Default/Users/root", "AuthenticationAuthority"])
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        // If dscl returns content (not an error), root has an authentication authority => password is set.
        if trimmed.contains("AuthenticationAuthority") || trimmed.contains("Kerberosv5") || trimmed.contains("ShadowHash") {
            return true
        }
        // Fallback: if dscl returned an error, we cannot determine compliance.
        if trimmed.isEmpty || trimmed.contains("No such key") {
            return nil
        }
        return nil
    }

    // MARK: - Installed Applications

    private func scanInstalledApplications() -> [String] {
        var apps: [String] = []
        let fm = FileManager.default

        let appDirectories = [
            "/Applications"
        ]

        for dir in appDirectories {
            do {
                let contents = try fm.contentsOfDirectory(atPath: dir)
                for item in contents {
                    if item.hasSuffix(".app") {
                        // Read the bundle display name from Info.plist if available.
                        let plistPath = "\(dir)/\(item)/Contents/Info.plist"
                        var appName = item.replacingOccurrences(of: ".app", with: "")

                        if let plistData = fm.contents(atPath: plistPath),
                           let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
                           let displayName = plist["CFBundleDisplayName"] as? String ?? plist["CFBundleName"] as? String {
                            appName = displayName
                        }

                        apps.append(appName)
                    }
                }
            } catch {
                logWarn("Could not scan \(dir): \(error.localizedDescription)")
            }
        }

        return apps.sorted()
    }

    // MARK: - Sysctl Helpers

    private func sysctlString(_ name: String) -> String? {
        var size = 0
        let nameMIB = [CTL_HW, HW_MODEL]  // Only used for hw.model style queries
        sysctl(UnsafeMutablePointer(mutating: nameMIB), 2, nil, &size, nil, 0)

        guard size > 0 else { return nil }

        var buffer = [CChar](repeating: 0, count: size)
        let result = sysctl(UnsafeMutablePointer(mutating: nameMIB), 2, &buffer, &size, nil, 0)
        guard result == 0 else { return nil }

        return String(cString: buffer)
    }

    private func sysctlInteger(_ name: String) -> Int? {
        var size = MemoryLayout<Int>.size
        var value = 0
        let result = sysctlbyname(name, &value, &size, nil, 0)
        guard result == 0 else { return nil }
        return value
    }

    // MARK: - Process Execution Helper

    private func runProcess(launchPath: String, arguments: [String] = []) -> String {
        let process = Process()
        let pipe = Pipe()
        let errorPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = errorPipe

        do {
            try process.run()
            process.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            logWarn("Failed to run \(launchPath): \(error.localizedDescription)")
            return ""
        }
    }
}
