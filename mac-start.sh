#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.attys-dc-bot"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_FILE="$SCRIPT_DIR/bot.log"
ERR_LOG_FILE="$SCRIPT_DIR/bot.err.log"
LOCK_FILE="$SCRIPT_DIR/.bot.lock"
LAUNCHD_DOMAIN="gui/$(id -u)"

usage() {
  cat <<'EOF'
Attys DC BOT macOS launcher

Usage:
  ./mac-start.sh           Start in background with launchd
  ./mac-start.sh --fg      Start in foreground for diagnostics
  ./mac-start.sh --status  Print bot status
  ./mac-start.sh --stop    Stop this bot instance
  ./mac-start.sh --help    Show this help
EOF
}

load_node_env() {
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
  if ! command -v node >/dev/null 2>&1; then
    for candidate in /opt/homebrew/bin /usr/local/bin "$HOME/.nodenv/shims" "$HOME/.fnm/aliases/default/bin"; do
      if [[ -x "$candidate/node" ]]; then
        export PATH="$candidate:$PATH"
        break
      fi
    done
  fi
}

load_node_env
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js not found. Run ./install.sh after installing Node.js 20+."
  exit 1
fi

write_plist() {
  mkdir -p "$(dirname "$PLIST_FILE")"
  cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SCRIPT_DIR/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):$PATH</string>
    <key>ATTYS_BOT_LAUNCH_REASON</key>
    <string>macos-launcher</string>
    <key>ATTYS_OPERATOR_TOOLS_STATUS</key>
    <string>skipped</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$ERR_LOG_FILE</string>
</dict>
</plist>
EOF
}

build_if_needed() {
  cd "$SCRIPT_DIR"
  if [[ ! -f dist/index.js ]]; then
    npm run build
    return
  fi
  if find src -name '*.ts' -newer dist/index.js 2>/dev/null | grep -q .; then
    npm run build
  fi
}

ensure_sqlite() {
  cd "$SCRIPT_DIR"
  if [[ -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]]; then
    "$NODE_BIN" -e "require('./node_modules/better-sqlite3/build/Release/better_sqlite3.node')" >/dev/null 2>&1 || npm rebuild better-sqlite3
  fi
}

is_running() {
  launchctl print "$LAUNCHD_DOMAIN/$LABEL" >/dev/null 2>&1 && return 0
  pgrep -f "$SCRIPT_DIR/dist/index.js" >/dev/null 2>&1
}

stop_bot() {
  launchctl bootout "$LAUNCHD_DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl unload "$PLIST_FILE" >/dev/null 2>&1 || true
  pkill -f "$SCRIPT_DIR/dist/index.js" >/dev/null 2>&1 || true
  rm -f "$LOCK_FILE"
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --status)
    if is_running; then
      echo "Running."
    else
      echo "Stopped."
    fi
    exit 0
    ;;
  --stop)
    stop_bot
    echo "Stopped."
    exit 0
    ;;
  --fg)
    cd "$SCRIPT_DIR"
    build_if_needed
    ensure_sqlite
    export ATTYS_BOT_LAUNCH_REASON=macos-foreground
    export ATTYS_OPERATOR_TOOLS_STATUS=skipped
    touch "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"' EXIT
    exec "$NODE_BIN" "$SCRIPT_DIR/dist/index.js"
    ;;
esac

cd "$SCRIPT_DIR"
build_if_needed
ensure_sqlite
stop_bot
write_plist
launchctl bootstrap "$LAUNCHD_DOMAIN" "$PLIST_FILE" >/dev/null 2>&1 || launchctl load "$PLIST_FILE"

echo "Bot started in background with launchd."
echo "Stop: ./mac-start.sh --stop"
echo "Status: ./mac-start.sh --status"
echo "Log: tail -f bot.log"
