#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="attys-dc-bot"
SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME.service"
LOG_FILE="$SCRIPT_DIR/bot.log"
ERR_LOG_FILE="$SCRIPT_DIR/bot.err.log"
LOCK_FILE="$SCRIPT_DIR/.bot.lock"

usage() {
  cat <<'EOF'
Attys DC BOT Linux launcher

Usage:
  ./linux-start.sh           Start in background
  ./linux-start.sh --fg      Start in foreground for diagnostics
  ./linux-start.sh --status  Print bot status
  ./linux-start.sh --stop    Stop this bot instance
  ./linux-start.sh --help    Show this help
EOF
}

find_node() {
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)" >/dev/null 2>&1 || true
  fi
  command -v node 2>/dev/null || true
}

NODE_BIN="$(find_node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js not found. Run ./install.sh after installing Node.js 20+."
  exit 1
fi

supports_systemd_user() {
  command -v systemctl >/dev/null 2>&1 && systemctl --user status >/dev/null 2>&1
}

write_service() {
  mkdir -p "$(dirname "$SERVICE_FILE")"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Attys DC BOT
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
Environment=HOME=$HOME
Environment=PATH=$(dirname "$NODE_BIN"):$PATH
Environment=ATTYS_BOT_LAUNCH_REASON=linux-launcher
Environment=ATTYS_OPERATOR_TOOLS_STATUS=skipped
ExecStartPre=/bin/sh -c 'touch "$LOCK_FILE"'
ExecStart=$NODE_BIN $SCRIPT_DIR/dist/index.js
ExecStopPost=/bin/sh -c 'rm -f "$LOCK_FILE"'
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:$LOG_FILE
StandardError=append:$ERR_LOG_FILE

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
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
  if supports_systemd_user && systemctl --user is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    return 0
  fi
  pgrep -f "$SCRIPT_DIR/dist/index.js" >/dev/null 2>&1
}

stop_bot() {
  if supports_systemd_user; then
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
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
    export ATTYS_BOT_LAUNCH_REASON=linux-foreground
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

if supports_systemd_user; then
  write_service
  systemctl --user enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl --user start "$SERVICE_NAME"
  echo "Bot started in background via systemd --user."
else
  ATTYS_BOT_LAUNCH_REASON=linux-launcher ATTYS_OPERATOR_TOOLS_STATUS=skipped \
    nohup "$NODE_BIN" "$SCRIPT_DIR/dist/index.js" >> "$LOG_FILE" 2>> "$ERR_LOG_FILE" &
  echo "$!" > "$LOCK_FILE"
  echo "Bot started in background via nohup."
fi

echo "Stop: ./linux-start.sh --stop"
echo "Status: ./linux-start.sh --status"
echo "Log: tail -f bot.log"
