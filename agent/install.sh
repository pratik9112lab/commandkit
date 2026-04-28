#!/bin/bash
#
# CommandKit Agent Installer
# Builds and installs the CommandKit macOS MDM agent.
#
# Usage: sudo ./install.sh --server <URL> --token <enrollment-token>
#
set -euo pipefail

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

BINARY_NAME="commandkit-agent"
INSTALL_PATH="/usr/local/bin/${BINARY_NAME}"
PLIST_NAME="com.commandkit.agent.plist"
PLIST_INSTALL_PATH="/Library/LaunchDaemons/${PLIST_NAME}"
LOG_DIR="/var/log/commandkit"
STATE_DIR="/var/db/commandkit"
LAUNCHD_LABEL="com.commandkit.agent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SWIFT_PKG_DIR="${SCRIPT_DIR}/CommandKitAgent"

# ──────────────────────────────────────────────
# Argument Parsing
# ──────────────────────────────────────────────

SERVER_URL=""
ENROLLMENT_TOKEN=""

usage() {
    echo "Usage: sudo $0 --server <URL> --token <enrollment-token>"
    echo ""
    echo "Options:"
    echo "  --server <URL>     MDM server base URL (e.g. https://mdm.example.com)"
    echo "  --token <token>    Enrollment token for initial device enrollment"
    echo "  --help             Show this help message"
    exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)
            SERVER_URL="$2"
            shift 2
            ;;
        --token)
            ENROLLMENT_TOKEN="$2"
            shift 2
            ;;
        --help|-h)
            usage 0
            ;;
        *)
            echo "Unknown argument: $1"
            usage 1
            ;;
    esac
done

if [[ -z "${SERVER_URL}" || -z "${ENROLLMENT_TOKEN}" ]]; then
    echo "Error: --server and --token are required."
    usage 1
fi

# ──────────────────────────────────────────────
# Preflight Checks
# ──────────────────────────────────────────────

echo "=== CommandKit Agent Installer ==="
echo ""

# Must run as root.
if [[ "$(id -u)" -ne 0 ]]; then
    echo "Error: This installer must be run as root (use sudo)."
    exit 1
fi

# Verify Swift compiler is available.
if ! command -v swift &>/dev/null; then
    echo "Error: Swift compiler not found. Install Xcode Command Line Tools:"
    echo "  xcode-select --install"
    exit 1
fi

# Verify the Swift package directory exists.
if [[ ! -d "${SWIFT_PKG_DIR}" ]]; then
    echo "Error: Swift package not found at ${SWIFT_PKG_DIR}"
    exit 1
fi

# ──────────────────────────────────────────────
# Unload Existing Agent (if running)
# ──────────────────────────────────────────────

echo "Stopping existing agent (if running)..."
if launchctl list | grep -q "${LAUNCHD_LABEL}" &>/dev/null; then
    launchctl unload "${PLIST_INSTALL_PATH}" 2>/dev/null || true
fi

# ──────────────────────────────────────────────
# Build the Swift Package
# ──────────────────────────────────────────────

echo "Building CommandKit Agent (release configuration)..."
cd "${SWIFT_PKG_DIR}"
swift build -c release 2>&1

BUILT_BINARY="${SWIFT_PKG_DIR}/.build/release/CommandKitAgent"

if [[ ! -f "${BUILT_BINARY}" ]]; then
    echo "Error: Build output not found at ${BUILT_BINARY}"
    exit 1
fi

echo "Build successful."

# ──────────────────────────────────────────────
# Install Binary
# ──────────────────────────────────────────────

echo "Installing binary to ${INSTALL_PATH}..."
mkdir -p "$(dirname "${INSTALL_PATH}")"
cp -f "${BUILT_BINARY}" "${INSTALL_PATH}"
chmod 755 "${INSTALL_PATH}"

# Strip debug symbols for a smaller binary.
strip "${INSTALL_PATH}" 2>/dev/null || true

echo "Binary installed."

# ──────────────────────────────────────────────
# Create Directories
# ──────────────────────────────────────────────

echo "Creating directories..."

mkdir -p "${LOG_DIR}"
chmod 755 "${LOG_DIR}"

mkdir -p "${STATE_DIR}"
chmod 750 "${STATE_DIR}"

# ──────────────────────────────────────────────
# Install LaunchDaemon Plist
# ──────────────────────────────────────────────

echo "Installing LaunchDaemon plist..."

# Generate the plist with the actual server URL and token.
PLIST_SRC="${SCRIPT_DIR}/${PLIST_NAME}"

if [[ ! -f "${PLIST_SRC}" ]]; then
    echo "Error: Plist template not found at ${PLIST_SRC}"
    exit 1
fi

# Replace placeholders in the plist with actual values.
# Use | as delimiter to avoid conflicts with URL slashes.
sed -e "s|COMMANDKIT_SERVER_URL|${SERVER_URL}|g" \
    -e "s|COMMANDKIT_ENROLLMENT_TOKEN|${ENROLLMENT_TOKEN}|g" \
    "${PLIST_SRC}" > "${PLIST_INSTALL_PATH}"

chmod 644 "${PLIST_INSTALL_PATH}"
chown root:wheel "${PLIST_INSTALL_PATH}"

echo "LaunchDaemon plist installed."

# ──────────────────────────────────────────────
# Load the LaunchDaemon
# ──────────────────────────────────────────────

echo "Loading LaunchDaemon..."
launchctl load "${PLIST_INSTALL_PATH}"

# Wait a moment and verify it started.
sleep 2

if launchctl list | grep -q "${LAUNCHD_LABEL}" &>/dev/null; then
    echo "Agent loaded and running."
else
    echo "Warning: Agent may not have started. Check logs:"
    echo "  cat ${LOG_DIR}/agent.log"
    echo "  cat ${LOG_DIR}/agent_error.log"
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────

echo ""
echo "=== Installation Complete ==="
echo ""
echo "  Binary:    ${INSTALL_PATH}"
echo "  Plist:     ${PLIST_INSTALL_PATH}"
echo "  Logs:      ${LOG_DIR}/"
echo "  State:     ${STATE_DIR}/"
echo "  Server:    ${SERVER_URL}"
echo ""
echo "Manage the agent with:"
echo "  launchctl unload ${PLIST_INSTALL_PATH}   # Stop"
echo "  launchctl load ${PLIST_INSTALL_PATH}     # Start"
echo "  tail -f ${LOG_DIR}/agent.log             # View logs"
echo ""
