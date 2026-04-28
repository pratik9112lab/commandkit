import Foundation

// MARK: - Command Line Argument Parsing

struct CLIArguments {
    let serverURL: String
    let token: String

    static func parse() -> CLIArguments? {
        let args = CommandLine.arguments
        var serverURL: String?
        var token: String?

        var i = 1
        while i < args.count {
            switch args[i] {
            case "--server":
                i += 1
                if i < args.count {
                    serverURL = args[i]
                }
            case "--token":
                i += 1
                if i < args.count {
                    token = args[i]
                }
            case "--help", "-h":
                printUsage()
                return nil
            default:
                fputs("Unknown argument: \(args[i])\n", stderr)
                return nil
            }
            i += 1
        }

        guard let server = serverURL, let tok = token else {
            fputs("Error: --server and --token are required.\n\n", stderr)
            printUsage()
            return nil
        }

        guard URL(string: server) != nil else {
            fputs("Error: Invalid server URL: \(server)\n", stderr)
            return nil
        }

        return CLIArguments(serverURL: server, token: tok)
    }

    private static func printUsage() {
        let usage = """
        CommandKit Agent - macOS MDM Agent

        USAGE:
            commandkit-agent --server <URL> --token <enrollment-token>

        OPTIONS:
            --server <URL>     MDM server base URL (e.g. https://mdm.example.com)
            --token <token>    Enrollment token for initial device enrollment
            --help, -h         Show this help message

        The agent runs as a LaunchDaemon and communicates with the CommandKit
        MDM server to report device metrics and execute remote commands.
        """
        print(usage)
    }
}

// MARK: - Signal Handling

func setupSignalHandling(terminationHandler: @escaping () -> Void) {
    let signalSources: [Int32] = [SIGTERM, SIGINT]
    let sigQueue = DispatchQueue(label: "com.commandkit.agent.signals")

    for sig in signalSources {
        // Use sigaction to ignore the signal at the C level so that
        // Dispatch can catch it via the source.
        var sa = sigaction()
        sigemptyset(&sa.sa_mask)
        sa.sa_handler = SIG_IGN
        sigaction(sig, &sa, nil)

        guard let source = DispatchSource.makeSignalSource(signal: sig, queue: sigQueue) else {
            continue
        }
        source.setEventHandler {
            source.cancel()
            terminationHandler()
        }
        source.resume()
    }
}

// MARK: - Main Entry Point

guard let cliArgs = CLIArguments.parse() else {
    exit(1)
}

let agent = Agent(serverURL: cliArgs.serverURL, token: cliArgs.token)

let shutdownGroup = DispatchGroup()
shutdownGroup.enter()

setupSignalHandling {
    logInfo("Received termination signal, shutting down gracefully...")
    agent.shutdown()
    shutdownGroup.leave()
}

logInfo("CommandKit Agent starting (server: \(cliArgs.serverURL))")

agent.start()

// Block the main thread until shutdown is requested.
shutdownGroup.wait()

logInfo("CommandKit Agent exited.")
