import Foundation

// MARK: - Command Types

enum CommandType: String, Codable {
    case lock
    case restart
    case shutdown
    case runScript = "run_script"
    case installApp = "install_app"
    case uninstallApp = "uninstall_app"
    case collectLogs = "collect_logs"
}

// MARK: - Command Payload (from server)

struct CommandPayload: Codable {
    let id: String
    let type: String
    let payload: [String: String]?

    var commandType: CommandType? {
        CommandType(rawValue: type)
    }
}

// MARK: - Command Result

struct CommandResult {
    let stdout: String
    let stderr: String
    let exitCode: Int32
}

// MARK: - Command Executor

class CommandExecutor {

    /// Default timeout for command execution in seconds.
    private let defaultTimeout: TimeInterval = 300.0  // 5 minutes

    /// Execute a command received from the MDM server.
    func execute(command: CommandPayload) -> CommandResult {
        guard let type = command.commandType else {
            logError("Unknown command type: \(command.type)")
            return CommandResult(
                stdout: "",
                stderr: "Unknown command type: \(command.type)",
                exitCode: 1
            )
        }

        logInfo("Executing command type: \(type.rawValue)")

        switch type {
        case .lock:
            return executeLock()
        case .restart:
            return executeRestart()
        case .shutdown:
            return executeShutdown()
        case .runScript:
            return executeRunScript(payload: command.payload)
        case .installApp:
            return executeInstallApp(payload: command.payload)
        case .uninstallApp:
            return executeUninstallApp(payload: command.payload)
        case .collectLogs:
            return executeCollectLogs(payload: command.payload)
        }
    }

    // MARK: - Lock

    private func executeLock() -> CommandResult {
        // pmset lock triggers the screen lock on macOS.
        return runShellCommand(
            executable: "/usr/bin/pmset",
            arguments: ["lock"],
            timeout: 30.0
        )
    }

    // MARK: - Restart

    private func executeRestart() -> CommandResult {
        // shutdown -r now initiates an immediate restart.
        // The process will likely be killed before returning, so we report success
        // as soon as the command is launched.
        let result = runShellCommand(
            executable: "/sbin/shutdown",
            arguments: ["-r", "now"],
            timeout: 10.0
        )
        // If shutdown returns at all, report the result. Usually it won't
        // return because the system is going down.
        return result
    }

    // MARK: - Shutdown

    private func executeShutdown() -> CommandResult {
        let result = runShellCommand(
            executable: "/sbin/shutdown",
            arguments: ["-h", "now"],
            timeout: 10.0
        )
        return result
    }

    // MARK: - Run Script

    private func executeRunScript(payload: [String: String]?) -> CommandResult {
        guard let script = payload?["script"] else {
            return CommandResult(
                stdout: "",
                stderr: "Missing 'script' in command payload",
                exitCode: 1
            )
        }

        // Write the script to a temporary file for execution.
        let tempDir = NSTemporaryDirectory()
        let scriptPath = (tempDir as NSString).appendingPathComponent("commandkit_script_\(UUID().uuidString).sh")

        do {
            try script.write(toFile: scriptPath, atomically: true, encoding: .utf8)
            // Make the script executable.
            FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: scriptPath)

            let interpreter = payload?["interpreter"] ?? "/bin/bash"
            let result = runShellCommand(
                executable: interpreter,
                arguments: [scriptPath],
                timeout: defaultTimeout
            )

            // Clean up the temporary script.
            try? FileManager.default.removeItem(atPath: scriptPath)

            return result
        } catch {
            return CommandResult(
                stdout: "",
                stderr: "Failed to write script file: \(error.localizedDescription)",
                exitCode: 1
            )
        }
    }

    // MARK: - Install App

    private func executeInstallApp(payload: [String: String]?) -> CommandResult {
        guard let sourcePath = payload?["source"] else {
            return CommandResult(
                stdout: "",
                stderr: "Missing 'source' in command payload",
                exitCode: 1
            )
        }

        let fileExtension = (sourcePath as NSString).pathExtension.lowercased()

        if fileExtension == "pkg" || fileExtension == "mpkg" {
            return installPackage(sourcePath: sourcePath)
        } else if fileExtension == "dmg" {
            return installDMG(sourcePath: sourcePath, payload: payload)
        } else {
            return CommandResult(
                stdout: "",
                stderr: "Unsupported installer format: .\(fileExtension)",
                exitCode: 1
            )
        }
    }

    private func installPackage(sourcePath: String) -> CommandResult {
        // Use the Apple installer command for .pkg/.mpkg files.
        return runShellCommand(
            executable: "/usr/sbin/installer",
            arguments: ["-pkg", sourcePath, "-target", "/"],
            timeout: defaultTimeout
        )
    }

    private func installDMG(sourcePath: String, payload: [String: String]?) -> CommandResult {
        // Mount the DMG, copy the .app bundle, then unmount.
        let mountPoint = "/Volumes/commandkit_install_\(UUID().uuidString)"

        // Step 1: Attach the DMG.
        let attachResult = runShellCommand(
            executable: "/usr/bin/hdiutil",
            arguments: ["attach", sourcePath, "-mountpoint", mountPoint, "-nobrowse", "-quiet"],
            timeout: 120.0
        )

        if attachResult.exitCode != 0 {
            return CommandResult(
                stdout: attachResult.stdout,
                stderr: "Failed to mount DMG: \(attachResult.stderr)",
                exitCode: attachResult.exitCode
            )
        }

        // Step 2: Find .app bundles in the mounted DMG.
        let fm = FileManager.default
        var appToInstall: String?
        do {
            let contents = try fm.contentsOfDirectory(atPath: mountPoint)
            for item in contents {
                if item.hasSuffix(".app") {
                    appToInstall = "\(mountPoint)/\(item)"
                    break
                }
            }
        } catch {
            detachDMG(mountPoint: mountPoint)
            return CommandResult(
                stdout: "",
                stderr: "Failed to list DMG contents: \(error.localizedDescription)",
                exitCode: 1
            )
        }

        guard let appPath = appToInstall else {
            detachDMG(mountPoint: mountPoint)
            return CommandResult(
                stdout: "",
                stderr: "No .app bundle found in DMG",
                exitCode: 1
            )
        }

        // Step 3: Copy the .app to /Applications.
        let appName = (appPath as NSString).lastPathComponent
        let destPath = "/Applications/\(appName)"

        let copyResult = runShellCommand(
            executable: "/bin/cp",
            arguments: ["-R", appPath, destPath],
            timeout: defaultTimeout
        )

        // Step 4: Detach the DMG (always attempt, even if copy failed).
        detachDMG(mountPoint: mountPoint)

        return copyResult
    }

    private func detachDMG(mountPoint: String) {
        let detachResult = runShellCommand(
            executable: "/usr/bin/hdiutil",
            arguments: ["detach", mountPoint, "-quiet"],
            timeout: 30.0
        )
        if detachResult.exitCode != 0 {
            logWarn("Failed to detach DMG at \(mountPoint): \(detachResult.stderr)")
        }
    }

    // MARK: - Uninstall App

    private func executeUninstallApp(payload: [String: String]?) -> CommandResult {
        guard let appName = payload?["app_name"] else {
            return CommandResult(
                stdout: "",
                stderr: "Missing 'app_name' in command payload",
                exitCode: 1
            )
        }

        // Search common application directories.
        let searchPaths = ["/Applications", "/System/Applications"]
        var foundPath: String?

        for searchPath in searchPaths {
            let candidatePath = "\(searchPath)/\(appName).app"
            if FileManager.default.fileExists(atPath: candidatePath) {
                foundPath = candidatePath
                break
            }
            // Also try with the app name directly (might already include .app).
            let candidateWithExt = "\(searchPath)/\(appName)"
            if candidateWithExt.hasSuffix(".app") && FileManager.default.fileExists(atPath: candidateWithExt) {
                foundPath = candidateWithExt
                break
            }
        }

        guard let appPath = foundPath else {
            return CommandResult(
                stdout: "",
                stderr: "Application '\(appName)' not found in /Applications",
                exitCode: 1
            )
        }

        do {
            try FileManager.default.removeItem(atPath: appPath)
            return CommandResult(
                stdout: "Removed \(appPath)",
                stderr: "",
                exitCode: 0
            )
        } catch {
            return CommandResult(
                stdout: "",
                stderr: "Failed to remove \(appPath): \(error.localizedDescription)",
                exitCode: 1
            )
        }
    }

    // MARK: - Collect Logs

    private func executeCollectLogs(payload: [String: String]?) -> CommandResult {
        let logType = payload?["log_type"] ?? "system"
        let lastMinutes = payload?["last_minutes"] ?? "60"

        switch logType {
        case "system":
            // Use `log show` to collect unified logs.
            return runShellCommand(
                executable: "/usr/bin/log",
                arguments: ["show", "--predicate", "process == 'commandkit-agent'", "--last", "\(lastMinutes)m", "--style", "compact"],
                timeout: 120.0
            )
        case "install":
            // Read the install log.
            return runShellCommand(
                executable: "/usr/bin/tail",
                arguments: ["-n", "500", "/var/log/install.log"],
                timeout: 30.0
            )
        case "system_log":
            // Read the traditional system.log.
            return runShellCommand(
                executable: "/usr/bin/tail",
                arguments: ["-n", "500", "/var/log/system.log"],
                timeout: 30.0
            )
        default:
            // For custom log files, read them directly.
            let logPath = payload?["log_path"]
            if let path = logPath {
                return runShellCommand(
                    executable: "/usr/bin/tail",
                    arguments: ["-n", "500", path],
                    timeout: 30.0
                )
            }
            return CommandResult(
                stdout: "",
                stderr: "Unknown log_type '\(logType)' and no log_path provided",
                exitCode: 1
            )
        }
    }

    // MARK: - Shell Command Runner

    /// Run a shell command with a timeout, capturing stdout and stderr.
    private func runShellCommand(executable: String, arguments: [String], timeout: TimeInterval) -> CommandResult {
        let process = Process()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        let timeoutDate = Date().addingTimeInterval(timeout)

        do {
            try process.run()
        } catch {
            return CommandResult(
                stdout: "",
                stderr: "Failed to launch \(executable): \(error.localizedDescription)",
                exitCode: 127
            )
        }

        // Read stdout and stderr asynchronously to avoid deadlocks.
        var stdoutData = Data()
        var stderrData = Data()

        let stdoutGroup = DispatchGroup()
        let stderrGroup = DispatchGroup()

        stdoutGroup.enter()
        stderrGroup.enter()

        DispatchQueue.global(qos: .utility).async {
            stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            stdoutGroup.leave()
        }

        DispatchQueue.global(qos: .utility).async {
            stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
            stderrGroup.leave()
        }

        // Wait for the process to finish or timeout.
        while process.isRunning {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
            if Date() > timeoutDate {
                process.terminate()
                logWarn("Command \(executable) timed out after \(timeout)s")

                stdoutGroup.wait()
                stderrGroup.wait()

                return CommandResult(
                    stdout: String(data: stdoutData, encoding: .utf8) ?? "",
                    stderr: String(data: stderrData, encoding: .utf8).map { $0 + "\n[TIMEOUT] Command exceeded \(Int(timeout)) second limit" } ?? "[TIMEOUT] Command exceeded \(Int(timeout)) second limit",
                    exitCode: -1
                )
            }
        }

        stdoutGroup.wait()
        stderrGroup.wait()

        let stdout = String(data: stdoutData, encoding: .utf8) ?? ""
        let stderr = String(data: stderrData, encoding: .utf8) ?? ""

        return CommandResult(
            stdout: stdout,
            stderr: stderr,
            exitCode: process.terminationStatus
        )
    }
}
