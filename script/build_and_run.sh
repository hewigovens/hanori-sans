#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="HanoriPreview"
BUNDLE_ID="me.hanori.preview"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/build/apple/Build/Products/Debug/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# The iOS simulator runs the same executable name on the host. Match the Mac
# bundle path before stopping or verifying a process.
mac_app_pids() {
  for app_pid in $(pgrep -x "$APP_NAME" || true); do
    if [[ "$(ps -p "$app_pid" -o comm=)" == "$APP_BINARY" ]]; then
      printf '%s\n' "$app_pid"
    fi
  done
}

case "$MODE" in
  run|--debug|--logs|--telemetry|--verify) ;;
  *) echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2; exit 2 ;;
esac

for app_pid in $(mac_app_pids); do kill "$app_pid"; done
if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate --spec "$ROOT_DIR/app/project.yml" --quiet
fi
xcodebuild -quiet -project "$ROOT_DIR/app/HanoriPreview.xcodeproj" \
  -scheme "$APP_NAME" -configuration Debug -destination "platform=macOS,arch=$(uname -m)" \
  -derivedDataPath "$ROOT_DIR/build/apple" CODE_SIGNING_ALLOWED=NO build

case "$MODE" in
  run) /usr/bin/open -n "$APP_BUNDLE" ;;
  --debug) lldb -- "$APP_BINARY" ;;
  --logs)
    /usr/bin/open -n "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry)
    /usr/bin/open -n "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify)
    /usr/bin/open -n "$APP_BUNDLE"
    sleep 1
    [[ -n "$(mac_app_pids)" ]]
    ;;
esac
