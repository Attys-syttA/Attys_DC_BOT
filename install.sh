#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Attys DC BOT installer

Usage:
  ./install.sh          Check dependencies, install npm packages, and build
  ./install.sh --help   Show this help

This script is explicit setup, not normal bot startup. It may run npm install.
It does not write secrets and does not create a real .env file.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

cd "$SCRIPT_DIR"

echo "==================================="
echo " Attys DC BOT Installer"
echo "==================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 20+ first:"
  echo "  macOS: brew install node, nvm, or nodejs.org"
  echo "  Linux: distro package, nvm, fnm, or nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ is required. Current: $(node --version)"
  exit 1
fi
echo "OK Node.js $(node --version)"

if command -v codex >/dev/null 2>&1; then
  echo "OK Codex CLI $(codex --version 2>/dev/null || echo 'version unknown')"
else
  echo "Codex CLI was not found."
  echo "Install it, then run: codex login"
  echo "Suggested command: npm install -g @openai/codex"
fi

echo "Installing npm dependencies..."
npm install

if [[ ! -f ".env" ]]; then
  echo ".env not found. Copy .env.example to .env and fill local values."
fi

echo "Building project..."
npm run build

echo
echo "Installation check complete."
case "$(uname -s)" in
  Darwin)
    echo "Next start command: ./mac-start.sh"
    ;;
  Linux)
    echo "Next start command: ./linux-start.sh"
    ;;
  *)
    echo "Next start command: use the platform-specific launcher."
    ;;
esac
