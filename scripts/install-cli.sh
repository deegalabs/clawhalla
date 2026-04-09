#!/bin/bash
# ClawHalla -- install-cli.sh
# Builds apps/cli/ and symlinks the clawhalla binary into ~/.local/bin.
# No sudo needed. Workshop-friendly: participant clones the repo, runs
# this script, and from then on `clawhalla connect ...` works anywhere.
#
# Usage: ./scripts/install-cli.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
error(){ echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Navigate to project root
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CLI_DIR="$ROOT/apps/cli"

[ -d "$CLI_DIR" ] || error "apps/cli/ not found. Are you running this from the clawhalla repo?"

# 1. Check node.
if ! command -v node >/dev/null 2>&1; then
  error "node is not installed. Install Node.js >= 20 first (https://nodejs.org)."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "node $(node --version) is too old. ClawHalla CLI needs Node.js >= 20."
fi

# 2. Ensure pnpm is available. Prefer whatever is on PATH; otherwise enable
#    corepack (ships with Node 20+) and let it fetch a pinned pnpm.
if ! command -v pnpm >/dev/null 2>&1; then
  info "pnpm not found, enabling corepack..."
  if ! command -v corepack >/dev/null 2>&1; then
    error "corepack is not available. Upgrade Node.js to >= 20 or install pnpm manually."
  fi
  corepack enable
  corepack prepare pnpm@10.28.1 --activate
fi

# 3. Install deps and build.
info "Installing CLI dependencies..."
( cd "$CLI_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install )

info "Building CLI..."
( cd "$CLI_DIR" && pnpm build )

[ -f "$CLI_DIR/dist/index.js" ] || error "Build did not produce dist/index.js"

# Belt and suspenders: some git checkouts on Windows / WSL lose the exec bit
# on the launcher even though we committed it with mode 0755.
chmod +x "$CLI_DIR/bin/clawhalla.js"

# 4. Symlink into ~/.local/bin (create it if missing).
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$CLI_DIR/bin/clawhalla.js" "$BIN_DIR/clawhalla"
ok "Installed: $BIN_DIR/clawhalla -> $CLI_DIR/bin/clawhalla.js"

# 5. PATH check.
case ":$PATH:" in
  *":$BIN_DIR:"*)
    ok "$BIN_DIR is already on PATH."
    ;;
  *)
    echo ""
    info "Add $BIN_DIR to your PATH. For zsh/bash:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    info "Put that in your ~/.zshrc or ~/.bashrc and restart the shell."
    ;;
esac

echo ""
ok "Try it:  clawhalla --help"
info "Then:   clawhalla connect <user>@<vps-ip>:<port>"
