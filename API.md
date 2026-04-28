# CommandKit API Documentation

## Base URL

```
https://commandkit.example.com/api
```

## Authentication

All API endpoints require authentication via an API key passed in the `Authorization` header:

```
Authorization: Bearer <api-key>
```

API keys are issued per organization and can be managed from the CommandKit dashboard. Requests without a valid API key will receive a `401 Unauthorized` response.

## Rate Limiting

All API endpoints are subject to rate limiting:

- **Enrollment endpoints**: 10 requests per minute per IP
- **Device metrics**: 30 requests per minute per device
- **Command endpoints**: 60 requests per minute per API key
- **Webhook endpoints**: 120 requests per minute per API key

Rate limit headers are included in every response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the rate limit window resets |

When rate limits are exceeded, the API returns a `429 Too Many Requests` response with a `Retry-After` header specifying the number of seconds until the next request is allowed.

---

## Endpoints

### 1. Get Enrollment Profile

Retrieve enrollment profile details for a given token. This endpoint is used by the CommandKit agent during device enrollment to fetch the MDM server URL and organization details.

**Request**

```
GET /api/enroll/{token}
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | The enrollment token issued by an administrator |

**Response: 200 OK**

```json
{
  "enrollment_profile": {
    "token": "ck_enroll_a1b2c3d4e5f6",
    "organization": {
      "id": "uuid-org",
      "name": "Acme Corp",
      "slug": "acme-corp"
    },
    "expires_at": "2025-12-31T23:59:59Z",
    "mdm_server_url": "https://commandkit.example.com/api/enroll/ck_enroll_a1b2c3d4e5f6"
  }
}
```

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `Enrollment token not found` | The token does not exist |
| 410 | `Enrollment token has already been used` | The token was already consumed |
| 410 | `Enrollment token has expired` | The token has passed its expiration date |

---

### 2. Enroll a Device

Submit device information to complete enrollment using a valid enrollment token. This creates a device record in the organization and marks the token as used.

**Request**

```
POST /api/enroll/{token}
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | The enrollment token issued by an administrator |

**Request Body**

```json
{
  "serial_number": "C02XG1XXJGH5",
  "device_uuid": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "device_name": "MacBook Pro",
  "macos_version": "14.5.0",
  "hardware_model": "MacBookPro18,3",
  "cpu_type": "apple_silicon"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serial_number` | string | Yes | Hardware serial number of the Mac |
| `device_uuid` | string | Yes | Platform UUID of the device |
| `device_name` | string | Yes | Human-readable device name |
| `macos_version` | string | Yes | macOS version string |
| `hardware_model` | string | Yes | Hardware model identifier |
| `cpu_type` | string | Yes | One of: `intel`, `apple_silicon` |

**Response: 201 Created**

```json
{
  "device": {
    "id": "uuid-device",
    "serial_number": "C02XG1XXJGH5",
    "device_uuid": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
    "device_name": "MacBook Pro",
    "macos_version": "14.5.0",
    "hardware_model": "MacBookPro18,3",
    "cpu_type": "apple_silicon",
    "enrollment_date": "2025-01-15T10:30:00Z",
    "compliance_status": "unknown"
  }
}
```

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `Invalid JSON in request body` | Request body is not valid JSON |
| 400 | `Missing required fields` | One or more required fields are absent |
| 400 | `Invalid cpu_type` | cpu_type is not one of the allowed values |
| 404 | `Enrollment token not found` | The token does not exist |
| 409 | `A device with this serial number is already enrolled in this organization` | Duplicate serial number |
| 409 | `A device with this UUID is already enrolled` | Duplicate device UUID |
| 410 | `Enrollment token has already been used` | The token was already consumed |
| 410 | `Enrollment token has expired` | The token has passed its expiration date |
| 500 | `Failed to create device record` | Internal server error during device creation |

---

### 3. Get Pending Commands for a Device

Retrieve pending and queued commands for a device. Fetched commands are automatically transitioned to `sent` status. The CommandKit agent polls this endpoint to retrieve commands for execution.

**Request**

```
GET /api/devices/{id}/commands
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Device UUID |

**Response: 200 OK**

```json
{
  "commands": [
    {
      "id": "uuid-command",
      "command_type": "install_profile",
      "payload": {
        "profile_identifier": "com.acme.wifi",
        "profile_content": "<base64-encoded-profile>"
      }
    }
  ]
}
```

When no pending commands exist, the response returns an empty array:

```json
{
  "commands": []
}
```

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `Device not found` | The device ID does not exist |
| 500 | `Failed to fetch commands` | Internal database error |

---

### 4. Submit Device Metrics

Submit hardware and software metrics for a device. The server automatically evaluates compliance status based on the reported security settings (FileVault, firewall, and password policy compliance).

**Request**

```
POST /api/devices/{id}/metrics
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Device UUID |

**Request Body**

```json
{
  "storage_total_gb": 512,
  "storage_used_gb": 256,
  "battery_health": 95,
  "battery_cycle_count": 142,
  "filevault_enabled": true,
  "firewall_enabled": true,
  "password_policy_compliant": true,
  "macos_version": "14.5.0",
  "device_name": "MacBook Pro",
  "is_online": true,
  "installed_apps": [
    {
      "app_name": "Safari",
      "app_version": "17.5",
      "bundle_id": "com.apple.Safari"
    },
    {
      "app_name": "Slack",
      "app_version": "4.38",
      "bundle_id": "com.tinyspeck.slackmacgap"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `storage_total_gb` | number | Yes | Total storage capacity in GB |
| `storage_used_gb` | number | Yes | Used storage in GB |
| `battery_health` | number | Yes | Battery health percentage (0-100) |
| `battery_cycle_count` | number | Yes | Battery cycle count |
| `filevault_enabled` | boolean | Yes | Whether FileVault disk encryption is enabled |
| `firewall_enabled` | boolean | Yes | Whether the macOS firewall is enabled |
| `password_policy_compliant` | boolean | Yes | Whether the device password meets policy requirements |
| `macos_version` | string | Yes | Current macOS version |
| `device_name` | string | Yes | Current device name |
| `is_online` | boolean | Yes | Whether the device is currently online |
| `installed_apps` | array | No | List of installed applications |

Each item in `installed_apps`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `app_name` | string | Yes | Application display name |
| `app_version` | string | No | Application version |
| `bundle_id` | string | Yes | Application bundle identifier |

**Response: 200 OK**

```json
{
  "message": "Device metrics updated successfully",
  "compliance_status": "compliant"
}
```

The `compliance_status` is computed server-side:

- `compliant` -- FileVault is enabled, firewall is enabled, and password policy is compliant
- `non_compliant` -- Any of the above security controls are disabled or non-compliant

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `Invalid JSON in request body` | Request body is not valid JSON |
| 400 | `Missing required fields` | One or more required fields are absent |
| 400 | `Each installed app must have app_name and bundle_id` | Invalid installed_apps structure |
| 404 | `Device not found` | The device ID does not exist |
| 500 | `Failed to update device metrics` | Internal database error |

---

### 5. Submit Command Result

Submit the execution result for a command. Results can only be submitted for commands that are in `sent` or `executing` status. The result is logged to the audit trail.

**Request**

```
POST /api/commands/{id}/result
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Command UUID |

**Request Body**

```json
{
  "status": "completed",
  "result": {
    "stdout": "Profile installed successfully",
    "stderr": "",
    "exit_code": 0
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | Either `completed` or `failed` |
| `result` | object | Yes | Result object containing execution output |
| `result.stdout` | string | No | Standard output from command execution |
| `result.stderr` | string | No | Standard error from command execution |
| `result.exit_code` | number | No | Process exit code |

**Response: 200 OK**

```json
{
  "message": "Command result recorded successfully",
  "command_id": "uuid-command",
  "status": "completed"
}
```

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `Invalid JSON in request body` | Request body is not valid JSON |
| 400 | `Invalid status` | Status is not `completed` or `failed` |
| 400 | `Missing or invalid result object` | Result is missing or not an object |
| 404 | `Command not found` | The command ID does not exist |
| 409 | `Cannot update command result` | Command is not in `sent` or `executing` status |
| 500 | `Failed to update command result` | Internal database error |

---

### 6. Submit Device Event

Submit a device lifecycle event such as online/offline status changes, sleep/wake transitions, enrollment confirmations, or unenrollment. Status-affecting events automatically update the device's `is_online` field.

**Request**

```
POST /api/webhooks/device-events
```

**Request Body**

```json
{
  "device_id": "uuid-device",
  "event_type": "device.online",
  "payload": {
    "source": "agent",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | string | Yes | UUID of the device |
| `event_type` | string | Yes | Type of event (see below) |
| `payload` | object | No | Additional event metadata |

**Recognized Event Types**

| Event Type | Effect on Device Status |
|------------|------------------------|
| `device.online` | Sets `is_online` to `true` |
| `device.offline` | Sets `is_online` to `false` |
| `device.awake` | Sets `is_online` to `true` |
| `device.sleep` | Sets `is_online` to `false` |
| `device.enrollment_confirmed` | Sets `is_online` to `true` |
| `device.unenrolled` | Sets `is_online` to `false` |

Unrecognized event types are still logged to the audit trail but do not affect device status.

**Response: 200 OK**

```json
{
  "message": "Device event processed successfully",
  "device_id": "uuid-device",
  "event_type": "device.online"
}
```

**Error Responses**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `Invalid JSON in request body` | Request body is not valid JSON |
| 400 | `Missing required fields: device_id, event_type` | Required fields are missing |
| 400 | `event_type must be a string` | event_type is not a string |
| 400 | `payload must be an object` | payload is not an object |
| 404 | `Device not found` | The device ID does not exist |

---

## Common Error Format

All error responses follow a consistent structure:

```json
{
  "error": "Human-readable error message",
  "details": "Optional additional context"
}
```

The `details` field is only present on certain error responses (typically 500 errors) to provide debug information.

## Pagination

Endpoints that return lists do not currently support pagination. This will be added in a future API version.
