import Foundation

// MARK: - API Model Types

struct EnrollmentPayload: Codable {
    let token: String
    let serialNumber: String
    let hardwareModel: String
    let osVersion: String
    let cpuType: String
    let deviceUUID: String
}

struct EnrollmentResponse: Codable {
    let deviceId: String
    let token: String
}

struct MetricsPayload: Codable {
    let serialNumber: String
    let hardwareModel: String
    let osVersion: String
    let cpuType: String
    let deviceUUID: String
    let totalStorageGB: Double
    let usedStorageGB: Double
    let batteryHealth: Int?
    let batteryCycleCount: Int?
    let fileVaultEnabled: Bool?
    let firewallEnabled: Bool?
    let passwordPolicyCompliant: Bool?
    let installedApps: [String]?
    let reportedAt: String
}

struct CommandResultPayload: Codable {
    let commandId: String
    let status: String
    let stdout: String
    let stderr: String
    let exitCode: Int32
    let completedAt: String
}

/// Placeholder for empty API responses.
struct EmptyResponse: Codable {}

// MARK: - HTTP Errors

enum HTTPClientError: LocalizedError {
    case invalidURL
    case requestFailed(statusCode: Int, body: String)
    case decodingFailed(Error)
    case requestTimedOut
    case noData
    case allRetriesExhausted

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .requestFailed(let code, let body):
            return "HTTP \(code): \(body)"
        case .decodingFailed(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .requestTimedOut:
            return "Request timed out"
        case .noData:
            return "No data in response"
        case .allRetriesExhausted:
            return "All retry attempts exhausted"
        }
    }
}

// MARK: - HTTP Client

class HTTPClient {
    private let baseURL: String
    private let session: URLSession
    private let maxRetries = 3
    private let retryBaseDelay: TimeInterval = 1.0
    private let requestTimeout: TimeInterval = 30.0

    init(serverBaseURL: String) {
        self.baseURL = serverBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 60.0
        // Only allow HTTPS in production; allow HTTP for development.
        // config.tlsMinimumSupportedProtocolVersion = .tlsProtocol12
        self.session = URLSession(configuration: config)
    }

    // MARK: - GET

    func get<T: Decodable>(path: String) throws -> T {
        let url = buildURL(path: path)
        var lastError: Error?

        for attempt in 0..<maxRetries {
            do {
                return try performGET(url: url)
            } catch HTTPClientError.requestFailed(let code, _) where (500...599).contains(code) {
                lastError = error
                let delay = retryBaseDelay * pow(2.0, Double(attempt))
                logWarn("Server error \(code) on GET \(path). Retry \(attempt + 1)/\(maxRetries) after \(delay)s.")
                Thread.sleep(forTimeInterval: delay)
            } catch HTTPClientError.requestTimedOut {
                lastError = error
                let delay = retryBaseDelay * pow(2.0, Double(attempt))
                logWarn("GET \(path) timed out. Retry \(attempt + 1)/\(maxRetries) after \(delay)s.")
                Thread.sleep(forTimeInterval: delay)
            } catch {
                throw error
            }
        }

        throw HTTPClientError.allRetriesExhausted
    }

    // MARK: - POST

    func post<T: Decodable>(path: String, body: Encodable) throws -> T {
        let url = buildURL(path: path)
        var lastError: Error?

        for attempt in 0..<maxRetries {
            do {
                return try performPOST(url: url, body: body)
            } catch HTTPClientError.requestFailed(let code, _) where (500...599).contains(code) {
                lastError = error
                let delay = retryBaseDelay * pow(2.0, Double(attempt))
                logWarn("Server error \(code) on POST \(path). Retry \(attempt + 1)/\(maxRetries) after \(delay)s.")
                Thread.sleep(forTimeInterval: delay)
            } catch HTTPClientError.requestTimedOut {
                lastError = error
                let delay = retryBaseDelay * pow(2.0, Double(attempt))
                logWarn("POST \(path) timed out. Retry \(attempt + 1)/\(maxRetries) after \(delay)s.")
                Thread.sleep(forTimeInterval: delay)
            } catch {
                throw error
            }
        }

        throw HTTPClientError.allRetriesExhausted
    }

    // MARK: - Internal Request Functions

    private func performGET<T: Decodable>(url: URL) throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("CommandKit-Agent/1.0", forHTTPHeaderField: "User-Agent")

        let data: Data
        let response: URLResponse

        let semaphore = DispatchSemaphore(value: 0)
        var requestError: Error?
        var responseData: Data?
        var responseURL: URLResponse?

        let task = session.dataTask(with: request) { d, r, e in
            responseData = d
            responseURL = r
            requestError = e
            semaphore.signal()
        }
        task.resume()

        let timeoutResult = semaphore.wait(timeout: .now() + requestTimeout)
        if timeoutResult == .timedOut {
            task.cancel()
            throw HTTPClientError.requestTimedOut
        }

        if let error = requestError {
            throw error
        }

        data = responseData ?? Data()
        response = responseURL!

        return try processResponse(data: data, response: response)
    }

    private func performPOST<T: Decodable>(url: URL, body: Encodable) throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("CommandKit-Agent/1.0", forHTTPHeaderField: "User-Agent")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            request.httpBody = try encoder.encode(body)
        } catch {
            logError("Failed to encode request body: \(error.localizedDescription)")
            throw error
        }

        let data: Data
        let response: URLResponse

        let semaphore = DispatchSemaphore(value: 0)
        var requestError: Error?
        var responseData: Data?
        var responseURL: URLResponse?

        let task = session.dataTask(with: request) { d, r, e in
            responseData = d
            responseURL = r
            requestError = e
            semaphore.signal()
        }
        task.resume()

        let timeoutResult = semaphore.wait(timeout: .now() + requestTimeout)
        if timeoutResult == .timedOut {
            task.cancel()
            throw HTTPClientError.requestTimedOut
        }

        if let error = requestError {
            throw error
        }

        data = responseData ?? Data()
        response = responseURL!

        return try processResponse(data: data, response: response)
    }

    // MARK: - Response Processing

    private func processResponse<T: Decodable>(data: Data, response: URLResponse) throws -> T {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPClientError.requestFailed(statusCode: 0, body: "Not an HTTP response")
        }

        let statusCode = httpResponse.statusCode
        let bodyString = String(data: data, encoding: .utf8) ?? ""

        // Success range: 2xx.
        if (200...299).contains(statusCode) {
            // For empty responses (e.g. 204 No Content), try to decode empty object.
            if data.isEmpty {
                if T.self == EmptyResponse.self {
                    return EmptyResponse() as! T
                }
                throw HTTPClientError.noData
            }

            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                return try decoder.decode(T.self, from: data)
            } catch {
                throw HTTPClientError.decodingFailed(error)
            }
        }

        // Client errors (4xx): do not retry, throw immediately.
        if (400...499).contains(statusCode) {
            throw HTTPClientError.requestFailed(statusCode: statusCode, body: bodyString)
        }

        // Server errors (5xx): will be retried by the caller.
        throw HTTPClientError.requestFailed(statusCode: statusCode, body: bodyString)
    }

    // MARK: - URL Builder

    private func buildURL(path: String) -> URL {
        let fullPath = "\(baseURL)\(path)"
        guard let url = URL(string: fullPath) else {
            logError("Invalid URL constructed: \(fullPath)")
            // Return a placeholder that will fail immediately; the error will be caught upstream.
            return URL(string: "http://invalid-url")!
        }
        return url
    }
}
