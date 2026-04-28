import Foundation

// MARK: - Logging

func logInfo(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    print("[\(timestamp)] [INFO] \(message)")
}

func logError(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    fputs("[\(timestamp)] [ERROR] \(message)\n", stderr)
}

func logWarn(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    print("[\(timestamp)] [WARN] \(message)")
}

// MARK: - Enrollment State

struct EnrollmentState: Codable {
    let deviceId: String
    let enrollmentToken: String
    let enrolledAt: Date
}

// MARK: - Agent Configuration

enum AgentConfig {
    static let enrollmentsDirectory = "/var/db/commandkit"
    static let enrollmentFilePath = "/var/db/commandkit/enrollment.json"
    static let metricIntervalSeconds: TimeInterval = 60.0
    static let commandPollIntervalSeconds: TimeInterval = 30.0
    static let maxConsecutiveFailures = 10
    static let initialBackoffSeconds: TimeInterval = 2.0
}

// MARK: - Agent Class

class Agent {
    private let serverURL: String
    private let token: String
    private let httpClient: HTTPClient
    private let deviceInfoCollector: DeviceInfo
    private let commandExecutor: CommandExecutor

    private var enrollmentState: EnrollmentState?
    private var isRunning = false
    private var consecutiveFailures = 0

    private var metricTimer: DispatchSourceTimer?
    private var commandTimer: DispatchSourceTimer?
    private let agentQueue = DispatchQueue(label: "com.commandkit.agent.main", qos: .utility)

    init(serverURL: String, token: String) {
        self.serverURL = serverURL
        self.token = token
        self.httpClient = HTTPClient(serverBaseURL: serverURL)
        self.deviceInfoCollector = DeviceInfo()
        self.commandExecutor = CommandExecutor()
    }

    // MARK: - Public Lifecycle

    func start() {
        agentQueue.async { [weak self] in
            self?.runLoop()
        }
    }

    func shutdown() {
        agentQueue.async { [weak self] in
            guard let self = self else { return }
            self.isRunning = false
            self.metricTimer?.cancel()
            self.metricTimer = nil
            self.commandTimer?.cancel()
            self.commandTimer = nil
            logInfo("Agent shutdown complete.")
        }
    }

    // MARK: - Core Run Loop

    private func runLoop() {
        isRunning = true

        // Attempt enrollment before starting timers.
        if !loadExistingEnrollment() {
            do {
                try enroll()
            } catch {
                logError("Initial enrollment failed: \(error.localizedDescription)")
                logInfo("Agent will retry enrollment on next metric cycle.")
            }
        }

        startMetricTimer()
        startCommandPollTimer()

        logInfo("Agent running. Metrics every \(AgentConfig.metricIntervalSeconds)s, command poll every \(AgentConfig.commandPollIntervalSeconds)s.")
    }

    // MARK: - Enrollment

    private func loadExistingEnrollment() -> Bool {
        let filePath = AgentConfig.enrollmentFilePath
        guard FileManager.default.fileExists(atPath: filePath) else {
            logInfo("No existing enrollment found.")
            return false
        }

        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: filePath))
            enrollmentState = try JSONDecoder().decode(EnrollmentState.self, from: data)
            logInfo("Loaded existing enrollment for device \(enrollmentState!.deviceId)")
            return true
        } catch {
            logError("Failed to load enrollment state: \(error.localizedDescription)")
            return false
        }
    }

    private func enroll() throws {
        logInfo("Starting enrollment...")

        let deviceInfo = deviceInfoCollector.collect()
        let payload = EnrollmentPayload(
            token: token,
            serialNumber: deviceInfo.serialNumber,
            hardwareModel: deviceInfo.hardwareModel,
            osVersion: deviceInfo.osVersion,
            cpuType: deviceInfo.cpuType,
            deviceUUID: deviceInfo.deviceUUID
        )

        let response: EnrollmentResponse = try httpClient.post(
            path: "/api/enroll/\(token)",
            body: payload
        )

        let state = EnrollmentState(
            deviceId: response.deviceId,
            enrollmentToken: response.token,
            enrolledAt: Date()
        )

        try persistEnrollment(state)
        enrollmentState = state
        consecutiveFailures = 0

        logInfo("Enrollment successful. Device ID: \(response.deviceId)")
    }

    private func persistEnrollment(_ state: EnrollmentState) throws {
        let dir = AgentConfig.enrollmentsDirectory
        let fm = FileManager.default

        if !fm.fileExists(atPath: dir) {
            try fm.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: [
                .posixPermissions: 0o750
            ])
        }

        let data = try JSONEncoder().encode(state)
        try data.write(to: URL(fileURLWithPath: AgentConfig.enrollmentFilePath), options: .atomic)
        // Ensure the file is only readable by root.
        try FileManager.default.setAttributes([
            .posixPermissions: 0o600
        ], ofItemAtPath: AgentConfig.enrollmentFilePath)
    }

    // MARK: - Metric Reporting

    private func startMetricTimer() {
        let timer = DispatchSource.makeTimerSource(queue: agentQueue)
        timer.schedule(deadline: .now() + AgentConfig.metricIntervalSeconds, repeating: AgentConfig.metricIntervalSeconds)
        timer.setEventHandler { [weak self] in
            self?.reportMetrics()
        }
        timer.resume()
        metricTimer = timer
    }

    private func reportMetrics() {
        guard isRunning else { return }

        guard let deviceId = enrollmentState?.deviceId else {
            // Not enrolled yet, retry enrollment.
            logInfo("Not enrolled. Attempting enrollment...")
            do {
                try enroll()
            } catch {
                logError("Enrollment retry failed: \(error.localizedDescription)")
                handleNetworkFailure()
            }
            return
        }

        do {
            let deviceInfo = deviceInfoCollector.collect()
            let metrics = MetricsPayload(
                serialNumber: deviceInfo.serialNumber,
                hardwareModel: deviceInfo.hardwareModel,
                osVersion: deviceInfo.osVersion,
                cpuType: deviceInfo.cpuType,
                deviceUUID: deviceInfo.deviceUUID,
                totalStorageGB: deviceInfo.totalStorageGB,
                usedStorageGB: deviceInfo.usedStorageGB,
                batteryHealth: deviceInfo.batteryHealth,
                batteryCycleCount: deviceInfo.batteryCycleCount,
                fileVaultEnabled: deviceInfo.fileVaultEnabled,
                firewallEnabled: deviceInfo.firewallEnabled,
                passwordPolicyCompliant: deviceInfo.passwordPolicyCompliant,
                installedApps: deviceInfo.installedApps,
                reportedAt: ISO8601DateFormatter().string(from: Date())
            )

            let _: EmptyResponse = try httpClient.post(
                path: "/api/devices/\(deviceId)/metrics",
                body: metrics
            )

            consecutiveFailures = 0
            logInfo("Metrics reported successfully.")
        } catch {
            logError("Failed to report metrics: \(error.localizedDescription)")
            handleNetworkFailure()
        }
    }

    // MARK: - Command Polling

    private func startCommandPollTimer() {
        let timer = DispatchSource.makeTimerSource(queue: agentQueue)
        timer.schedule(deadline: .now() + AgentConfig.commandPollIntervalSeconds, repeating: AgentConfig.commandPollIntervalSeconds)
        timer.setEventHandler { [weak self] in
            self?.pollCommands()
        }
        timer.resume()
        commandTimer = timer
    }

    private func pollCommands() {
        guard isRunning, let deviceId = enrollmentState?.deviceId else { return }

        do {
            let commands: [CommandPayload] = try httpClient.get(
                path: "/api/devices/\(deviceId)/commands"
            )

            consecutiveFailures = 0

            for command in commands {
                executeAndReport(command: command, deviceId: deviceId)
            }
        } catch {
            logError("Failed to poll commands: \(error.localizedDescription)")
            handleNetworkFailure()
        }
    }

    private func executeAndReport(command: CommandPayload, deviceId: String) {
        logInfo("Executing command \(command.id): \(command.type)")

        let result = commandExecutor.execute(command: command)

        do {
            let resultPayload = CommandResultPayload(
                commandId: command.id,
                status: result.exitCode == 0 ? "completed" : "failed",
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                completedAt: ISO8601DateFormatter().string(from: Date())
            )

            let _: EmptyResponse = try httpClient.post(
                path: "/api/commands/\(command.id)/result",
                body: resultPayload
            )
            logInfo("Command \(command.id) result reported.")
        } catch {
            logError("Failed to report command result for \(command.id): \(error.localizedDescription)")
        }
    }

    // MARK: - Exponential Backoff

    private func handleNetworkFailure() {
        consecutiveFailures += 1

        if consecutiveFailures >= AgentConfig.maxConsecutiveFailures {
            logError("\(AgentConfig.maxConsecutiveFailures) consecutive network failures. Resetting backoff counter and continuing.")
            consecutiveFailures = AgentConfig.maxConsecutiveFailures / 2
        }

        let backoff = AgentConfig.initialBackoffSeconds * pow(2.0, Double(min(consecutiveFailures - 1, 8)))
        let cappedBackoff = min(backoff, 300.0) // Cap at 5 minutes.
        logWarn("Network failure #\(consecutiveFailures). Backing off for \(Int(cappedBackoff))s before next activity.")

        // Suspend timers temporarily and reschedule after backoff.
        metricTimer?.suspend()
        commandTimer?.suspend()

        agentQueue.asyncAfter(deadline: .now() + cappedBackoff) { [weak self] in
            guard let self = self, self.isRunning else { return }
            self.metricTimer?.resume()
            self.commandTimer?.resume()
        }
    }
}
