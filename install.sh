#!/bin/bash
set -e

# ClawHalla Install
# Usage:
#   curl -fsSL https://clawhalla.xyz/install.sh | bash
#   curl -fsSL https://clawhalla.xyz/install.sh | bash -s -- --bare
#   curl -fsSL https://clawhalla.xyz/install.sh | bash -s -- --docker

# ─────────────────────────────────────────────────────────────────────────────
# COLORS
# ─────────────────────────────────────────────────────────────────────────────
R='\033[0;31m'   # red
G='\033[0;32m'   # green
Y='\033[1;33m'   # yellow
B='\033[0;34m'   # blue
C='\033[0;36m'   # cyan
D='\033[2m'      # dim
NC='\033[0m'     # reset (NC = no color)

# ─────────────────────────────────────────────────────────────────────────────
# UI PRIMITIVES
# ─────────────────────────────────────────────────────────────────────────────
BW=55  # box width

box_top()    { echo -e "${C}  ┌$(printf '─%.0s' $(seq 1 $BW))┐${NC}"; }
box_div()    { echo -e "${C}  ├$(printf '─%.0s' $(seq 1 $BW))┤${NC}"; }
box_bot()    { echo -e "${C}  └$(printf '─%.0s' $(seq 1 $BW))┘${NC}"; }
box_empty()  { printf "${C}  │${NC}  %-${BW}s${C}│${NC}\n" ""; }
box_title()  { printf "${C}  │${NC}  ${Y}%-$((BW-2))s${C}│${NC}\n" "$1"; }
box_text()   { printf "${C}  │${NC}  %-$((BW-2))s${C}│${NC}\n" "$1"; }
box_opt()    {
    local num="$1" label="$2" desc="$3"
    local pad=$(( BW - 6 - ${#num} - ${#label} - ${#desc} ))
    [ $pad -lt 0 ] && pad=0
    printf "${C}  │${NC}  ${Y}%s${NC} · %s%s${D}%s${NC}  ${C}│${NC}\n" \
        "$num" "$label" "$(printf ' %.0s' $(seq 1 $pad))" "$desc"
}

ok()   { echo -e "  ${G}✓${NC}  $1"; }
info() { echo -e "  ${B}·${NC}  $1"; }
warn() { echo -e "  ${Y}⚠${NC}  $1"; }
err()  { echo -e "  ${R}✗${NC}  $1"; }

ask() {
    local prompt="$1" default="$2" var_name="$3"
    printf "  ${C}›${NC}  %s" "$prompt"
    [ -n "$default" ] && printf " ${D}[%s]${NC}" "$default"
    printf ": "
    read -r "$var_name"
    eval "$var_name=\${$var_name:-$default}"
}

cleanup() {
    [ $? -ne 0 ] && err "Installation failed. Check the output above."
}
trap cleanup EXIT

# Ensure stdin is a tty when piped via curl | bash
[ ! -t 0 ] && exec < /dev/tty

# ─────────────────────────────────────────────────────────────────────────────
# PARSE FLAGS
# ─────────────────────────────────────────────────────────────────────────────
FORCE_MODE=""
for arg in "$@"; do
    case $arg in
        --bare|--no-docker) FORCE_MODE="bare"   ;;
        --docker)           FORCE_MODE="docker" ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# BANNER
# ─────────────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "${C}   ██████╗██╗      █████╗ ██╗    ██╗██╗  ██╗ █████╗ ██╗     ██╗      █████╗ ${NC}"
echo -e "${C}  ██╔════╝██║     ██╔══██╗██║    ██║██║  ██║██╔══██╗██║     ██║     ██╔══██╗${NC}"
echo -e "${C}  ██║     ██║     ███████║██║ █╗ ██║███████║███████║██║     ██║     ███████║${NC}"
echo -e "${C}  ██║     ██║     ██╔══██║██║███╗██║██╔══██║██╔══██║██║     ██║     ██╔══██║${NC}"
echo -e "${C}  ╚██████╗███████╗██║  ██║╚███╔███╔╝██║  ██║██║  ██║███████╗███████╗██║  ██║${NC}"
echo -e "${C}   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝${NC}"
echo ""
echo -e "${D}  Squad-Based AI Agent Platform  ·  clawhalla.xyz${NC}"
echo ""

[ "$EUID" -eq 0 ] && { err "Do not run as root."; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 1. OS DETECTION
# ─────────────────────────────────────────────────────────────────────────────
OS=""; OS_VERSION=""; ENV_TYPE="local"

detect_os() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        ENV_TYPE="wsl2"
    fi

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        [ -f /etc/os-release ] && . /etc/os-release && OS=$ID && OS_VERSION=$VERSION_ID || { err "Cannot detect Linux distro."; exit 1; }
        # Detect VPS (no desktop, public IP different from private)
        if [ "$ENV_TYPE" != "wsl2" ] && [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
            PUBLIC_IP=$(curl -sf --max-time 3 https://api.ipify.org 2>/dev/null || echo "")
            PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
            [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "$PRIVATE_IP" ] && ENV_TYPE="vps"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"; OS_VERSION=$(sw_vers -productVersion)
    else
        err "Unsupported OS: $OSTYPE"; exit 1
    fi
}

detect_os

ENV_LABEL="Local machine"
[ "$ENV_TYPE" = "vps"  ] && ENV_LABEL="VPS / remote server"
[ "$ENV_TYPE" = "wsl2" ] && ENV_LABEL="Windows (WSL2)"

ok "OS: ${OS} ${OS_VERSION}  ·  Environment: ${ENV_LABEL}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 2. WIZARD
# ─────────────────────────────────────────────────────────────────────────────

# ── Company / workspace name ─────────────────────────────────────────────────
box_top
box_title "Workspace"
box_div
box_text "Name of your company or project."
box_text "Used to identify your agent workspace."
box_empty
box_bot
echo ""

while true; do
    ask "Workspace name" "my-company" WORKSPACE_NAME
    [[ "$WORKSPACE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] && break
    err "Letters, numbers, hyphens and underscores only."
done
echo ""

# ── Install mode ─────────────────────────────────────────────────────────────
INSTALL_MODE="$FORCE_MODE"

if [ -z "$INSTALL_MODE" ]; then
    DOCKER_OK=false
    command -v docker &>/dev/null && docker info &>/dev/null 2>&1 && DOCKER_OK=true

    box_top
    box_title "Install Mode"
    box_div
    box_opt "1" "Docker      " "Isolated containers — recommended for Mac/Windows"
    box_empty
    box_opt "2" "Bare Metal  " "Direct install on this OS — best for VPS/hackathons"
    box_bot
    echo ""

    [ "$DOCKER_OK" = "false" ] && warn "Docker not found — bare metal will be selected if you choose 1 and it cannot be installed."
    echo ""

    while true; do
        ask "Install mode" "1" _MODE
        case $_MODE in
            1) INSTALL_MODE="docker" ; break ;;
            2) INSTALL_MODE="bare"   ; break ;;
            *) err "Enter 1 or 2." ;;
        esac
    done
    echo ""
fi

# ── Install directory + data directory ───────────────────────────────────────
DEFAULT_INSTALL="$HOME/clawhalla"
DEFAULT_DATA="$HOME/clawhalla/data"

box_top
box_title "Directories"
box_div
box_text "Where to install ClawHalla."
box_text "Data dir holds volumes (workspace, DB, sessions)."
box_text "You can access data without entering the container."
box_empty
box_bot
echo ""

ask "Install directory" "$DEFAULT_INSTALL" INSTALL_DIR
ask "Data directory   " "${INSTALL_DIR}/data" DATA_DIR
echo ""

if [ -d "$INSTALL_DIR" ]; then
    # ── Detect existing install ───────────────────────────────────────────────
    if [ -f "${INSTALL_DIR}/.install-info.json" ]; then
        EXISTING_VER=$(grep -o '"version": *"[^"]*"' "${INSTALL_DIR}/.install-info.json" | grep -o '"[^"]*"$' | tr -d '"')
        EXISTING_MODE_RAW=$(grep -o '"mode": *"[^"]*"' "${INSTALL_DIR}/.install-info.json" | grep -o '"[^"]*"$' | tr -d '"')

        echo ""
        box_top
        box_title "Existing install detected"
        box_div
        box_text "Version : ${EXISTING_VER:-unknown}  ·  Mode: ${EXISTING_MODE_RAW:-unknown}"
        box_text "Directory: ${INSTALL_DIR}"
        box_empty
        box_opt "1" "Update     " "pull latest code, keep all data"
        box_opt "2" "Reinstall  " "fresh install, DATA DIR preserved"
        box_opt "3" "Abort      " "exit without changes"
        box_empty
        box_bot
        echo ""

        while true; do
            ask "Choose" "1" _EXISTING
            case $_EXISTING in
                1) EXISTING_ACTION="update"    ; break ;;
                2) EXISTING_ACTION="reinstall" ; break ;;
                3) err "Aborted."; exit 0 ;;
                *) err "Enter 1, 2, or 3." ;;
            esac
        done
        echo ""

        # ── Stop existing services ────────────────────────────────────────────
        info "Stopping existing services…"
        if [ "${EXISTING_MODE_RAW:-}" = "docker" ]; then
            cd "$INSTALL_DIR" && docker compose down 2>/dev/null || true
        else
            pm2 stop clawhalla-gateway clawhalla-mc 2>/dev/null || true
        fi
        ok "Services stopped"

        if [ "$EXISTING_ACTION" = "update" ]; then
            # Update: pull code, restart — data untouched
            info "Pulling latest code…"
            cd "$INSTALL_DIR" && git pull --quiet && ok "Code updated"

            info "Starting services…"
            if [ "${EXISTING_MODE_RAW:-}" = "docker" ]; then
                docker compose up -d --build
            else
                pm2 restart clawhalla-gateway 2>/dev/null || true
                pm2 restart clawhalla-mc 2>/dev/null || true
            fi
            ok "Services restarted"
            echo ""
            echo -e "  ${G}ClawHalla updated to latest version.${NC}"
            echo ""
            exit 0
        fi

        # Reinstall: wipe code dir only — DATA_DIR is preserved
        # Warn if DATA_DIR is nested inside INSTALL_DIR (default layout)
        if [[ "$DATA_DIR" == "${INSTALL_DIR}"* ]]; then
            warn "Data directory is inside install directory:"
            warn "  ${DATA_DIR}"
            warn "It will be PRESERVED — only code will be replaced."
            echo ""
            # Move data out temporarily, then restore after rm
            TMP_DATA=$(mktemp -d)
            cp -r "$DATA_DIR/." "$TMP_DATA/"
            DATA_BACKED_UP=true
        fi

        rm -rf "$INSTALL_DIR"
        # NOTE: DATA_DIR restore happens AFTER git clone to avoid recreating INSTALL_DIR prematurely

    else
        # Directory exists but no .install-info.json — unknown contents
        warn "Directory ${INSTALL_DIR} already exists (not a ClawHalla install)."
        ask "Remove and continue? (y/N)" "N" _OVR
        [[ "$_OVR" =~ ^[Yy]$ ]] || { err "Aborted."; exit 1; }
        rm -rf "$INSTALL_DIR"
    fi
fi

# ── Services ─────────────────────────────────────────────────────────────────
INSTALL_MC=true
INSTALL_OLLAMA=false

box_top
box_title "Services"
box_div
box_opt "✓" "OpenClaw Gateway " "always included"
box_empty
box_text "Mission Control — management dashboard"
if [ "$INSTALL_MODE" = "docker" ]; then
box_text "Ollama          — free local AI models (Llama, Mistral…)"
fi
box_empty
box_bot
echo ""

ask "Install Mission Control? (Y/n)" "Y" _MC
[[ "$_MC" =~ ^[Nn]$ ]] && INSTALL_MC=false

if [ "$INSTALL_MODE" = "docker" ]; then
    ask "Install Ollama (local models)? (y/N)" "N" _OL
    [[ "$_OL" =~ ^[Yy]$ ]] && INSTALL_OLLAMA=true
fi
echo ""

# ── MC access mode (only if MC is being installed) ───────────────────────────
MC_ACCESS="local"

if [ "$INSTALL_MC" = "true" ]; then
    box_top
    box_title "Mission Control Access"
    box_div
    box_opt "1" "Local           " "http://localhost:3000 — this machine only"
    box_empty
    box_opt "2" "Remote (VPS/LAN)" "http://YOUR_IP:3000 — accessible from network"
    box_empty
    box_opt "3" "controls.clawhalla.xyz" "Use the hosted web version (gateway only)"
    box_empty
    box_bot
    echo ""

    DEFAULT_MC_MODE="1"
    [ "$ENV_TYPE" = "vps" ] && DEFAULT_MC_MODE="2"

    while true; do
        ask "Access mode" "$DEFAULT_MC_MODE" _MCMODE
        case $_MCMODE in
            1) MC_ACCESS="local"  ; break ;;
            2) MC_ACCESS="remote" ; break ;;
            3) MC_ACCESS="cloud"  ; INSTALL_MC=false ; break ;;
            *) err "Enter 1, 2, or 3." ;;
        esac
    done
    echo ""
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. GENERATE GATEWAY TOKEN
# ─────────────────────────────────────────────────────────────────────────────
if command -v openssl &>/dev/null; then
    GATEWAY_TOKEN=$(openssl rand -hex 32)
else
    GATEWAY_TOKEN=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. CLONE REPO
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "Cloning repository…"
git clone https://github.com/deegalabs/clawhalla.git "$INSTALL_DIR" --quiet
ok "Cloned to ${INSTALL_DIR}"

# Restore data dir if it was backed up during reinstall
if [ "${DATA_BACKED_UP:-false}" = "true" ]; then
    mkdir -p "$DATA_DIR"
    cp -r "$TMP_DATA/." "$DATA_DIR/"
    rm -rf "$TMP_DATA"
    ok "Data directory restored"
fi
echo ""

# Docker: data dir holds volume mounts for both services
# Bare metal: openclaw always lives at ~/.openclaw (managed by openclaw CLI)
#             data dir only holds MC database
if [ "$INSTALL_MODE" = "docker" ]; then
    mkdir -p "$DATA_DIR/openclaw" "$DATA_DIR/mission-control"
else
    mkdir -p "$DATA_DIR/mission-control"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. WRITE OPENCLAW CONFIG (no openclaw onboard needed)
# ─────────────────────────────────────────────────────────────────────────────
write_openclaw_config() {
    local base="$1"
    local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "${base}/agents/main/agent" \
             "${base}/agents/main/sessions" \
             "${base}/workspace" \
             "${base}/logs"

    cat > "${base}/openclaw.json" <<EOF
{
  "meta": {
    "lastTouchedVersion": "2026.3.13",
    "lastTouchedAt": "${ts}"
  },
  "wizard": {
    "lastRunAt": "${ts}",
    "lastRunVersion": "2026.3.13",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {}
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${GATEWAY_TOKEN}"
    },
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  }
}
EOF

    # Empty auth-profiles — MC wizard will populate
    cat > "${base}/agents/main/agent/auth-profiles.json" <<EOF
{
  "version": 1,
  "profiles": {},
  "lastGood": {}
}
EOF

    # Workspace identity
    cat > "${base}/workspace/IDENTITY.md" <<EOF
# Workspace: ${WORKSPACE_NAME}
Created: ${ts}
EOF

    # Copy workspace template
    if [ -d "${INSTALL_DIR}/workspace-template" ]; then
        cp -r "${INSTALL_DIR}/workspace-template/." "${base}/workspace/"
        ok "15 pre-trained agents installed"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. DOCKER PATH
# ─────────────────────────────────────────────────────────────────────────────
if [ "$INSTALL_MODE" = "docker" ]; then

    # ── Ensure Docker ────────────────────────────────────────────────────────
    if ! command -v docker &>/dev/null || ! docker info &>/dev/null 2>&1; then
        info "Installing Docker…"
        if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
            sudo apt-get update -qq
            sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
            sudo install -m 0755 -d /etc/apt/keyrings
            curl -fsSL "https://download.docker.com/linux/${OS}/gpg" | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            sudo chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS} $(lsb_release -cs) stable" \
                | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            sudo apt-get update -qq
            sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            sudo usermod -aG docker "$USER"
            ok "Docker installed"
            warn "You may need to log out and back in for docker group changes to take effect."
        elif [[ "$OS" == "macos" ]]; then
            err "Install Docker Desktop from https://docker.com then re-run this script."
            exit 1
        fi
    fi

    DOCKER_VER=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
    ok "Docker ${DOCKER_VER}"

    if ! docker compose version &>/dev/null; then
        err "Docker Compose plugin not found."; exit 1
    fi
    ok "Docker Compose $(docker compose version --short)"

    # ── Generate docker-compose.yml ──────────────────────────────────────────
    info "Generating docker-compose.yml…"

    MC_PORT=3000
    [ "$MC_ACCESS" = "remote" ] && MC_BIND="0.0.0.0:" || MC_BIND="127.0.0.1:"

    cat > "${INSTALL_DIR}/docker-compose.yml" <<COMPOSE
services:

  openclaw:
    build: .
    container_name: ${WORKSPACE_NAME}-openclaw
    hostname: openclaw
    restart: unless-stopped
    stdin_open: true
    tty: true
    ports:
      - "18789:18789"
    volumes:
      - ${DATA_DIR}/openclaw:/home/clawdbot/.openclaw
    environment:
      - WORKSPACE_NAME=${WORKSPACE_NAME}
      - GATEWAY_TOKEN=${GATEWAY_TOKEN}
COMPOSE

    if [ "$INSTALL_MC" = "true" ]; then
        cat >> "${INSTALL_DIR}/docker-compose.yml" <<COMPOSE

  mission-control:
    build:
      context: ./apps/mission-control
      dockerfile: Dockerfile.dev
    container_name: ${WORKSPACE_NAME}-mc
    restart: unless-stopped
    ports:
      - "${MC_BIND}${MC_PORT}:3000"
    volumes:
      - ${DATA_DIR}/mission-control:/app/data
    environment:
      - GATEWAY_URL=http://openclaw:18789
      - GATEWAY_TOKEN=${GATEWAY_TOKEN}
      - DB_PATH=/app/data/mission-control.db
    depends_on:
      - openclaw
COMPOSE
    fi

    if [ "$INSTALL_OLLAMA" = "true" ]; then
        cat >> "${INSTALL_DIR}/docker-compose.yml" <<COMPOSE

  ollama:
    image: ollama/ollama:latest
    container_name: ${WORKSPACE_NAME}-ollama
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ${DATA_DIR}/ollama:/root/.ollama
COMPOSE
    fi

    ok "docker-compose.yml generated"

    # ── Write openclaw config into data dir ──────────────────────────────────
    write_openclaw_config "${DATA_DIR}/openclaw"

    # ── Create MC Dockerfile.dev if not present ──────────────────────────────
    MC_DIR="${INSTALL_DIR}/apps/mission-control"
    if [ ! -f "${MC_DIR}/Dockerfile.dev" ]; then
        cat > "${MC_DIR}/Dockerfile.dev" <<'DFILE'
FROM node:24-slim
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN mkdir -p data && pnpm drizzle-kit generate && pnpm drizzle-kit migrate
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
DFILE
    fi

    # ── Build & start ────────────────────────────────────────────────────────
    echo ""
    info "Building containers (this may take a few minutes)…"
    cd "$INSTALL_DIR"
    docker compose build --quiet
    ok "Build complete"

    info "Starting containers…"
    docker compose up -d
    ok "Containers started"

    # ── Wait for gateway ─────────────────────────────────────────────────────
    echo ""
    info "Waiting for gateway…"
    TRIES=0
    while [ $TRIES -lt 20 ]; do
        if curl -sf -H "Authorization: Bearer ${GATEWAY_TOKEN}" http://127.0.0.1:18789/health &>/dev/null; then
            ok "Gateway is live"; break
        fi
        TRIES=$((TRIES+1)); sleep 3
    done
    [ $TRIES -eq 20 ] && warn "Gateway health check timed out — check: docker compose logs openclaw"

    # ── Wait for MC ──────────────────────────────────────────────────────────
    if [ "$INSTALL_MC" = "true" ]; then
        info "Waiting for Mission Control…"
        TRIES=0
        while [ $TRIES -lt 30 ]; do
            if curl -sf "http://127.0.0.1:${MC_PORT}/api/health" &>/dev/null; then
                ok "Mission Control is live"; break
            fi
            TRIES=$((TRIES+1)); sleep 3
        done
        [ $TRIES -eq 30 ] && warn "MC health check timed out — check: docker compose logs mission-control"
    fi

    MC_URL="http://localhost:${MC_PORT}"
    [ "$MC_ACCESS" = "remote" ] && MC_URL="http://$(curl -sf --max-time 3 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}'):${MC_PORT}"

# ─────────────────────────────────────────────────────────────────────────────
# 7. BARE METAL PATH
# ─────────────────────────────────────────────────────────────────────────────
else

    export NVM_DIR="$HOME/.nvm"

    # ── Node 24 ──────────────────────────────────────────────────────────────
    info "Checking Node.js…"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        info "Installing nvm…"
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
        ok "nvm installed"
    fi
    \. "$NVM_DIR/nvm.sh"

    NODE_MAJOR=$(node --version 2>/dev/null | cut -d. -f1 | tr -d 'v' || echo "0")
    if [ "$NODE_MAJOR" -lt 22 ]; then
        info "Installing Node 24…"
        nvm install 24 --silent
        nvm alias default 24
        nvm use 24
    fi
    ok "Node $(node --version)"

    # ── pnpm ─────────────────────────────────────────────────────────────────
    if ! command -v pnpm &>/dev/null; then
        info "Enabling pnpm…"
        corepack enable pnpm
    fi
    ok "pnpm $(pnpm --version)"

    # ── OpenClaw ─────────────────────────────────────────────────────────────
    if ! command -v openclaw &>/dev/null; then
        info "Installing OpenClaw CLI…"
        pnpm add -g openclaw@latest --silent
    fi
    ok "OpenClaw $(openclaw --version 2>/dev/null | head -1)"

    # ── PM2 ──────────────────────────────────────────────────────────────────
    if ! command -v pm2 &>/dev/null; then
        info "Installing PM2 (process manager)…"
        pnpm add -g pm2 --silent
    fi
    ok "PM2 $(pm2 --version 2>/dev/null)"

    # ── OpenClaw config ───────────────────────────────────────────────────────
    write_openclaw_config "$HOME/.openclaw"

    # ── Mission Control ───────────────────────────────────────────────────────
    if [ "$INSTALL_MC" = "true" ]; then
        MC_DIR="${INSTALL_DIR}/apps/mission-control"
        info "Installing Mission Control dependencies…"
        cd "$MC_DIR"
        pnpm install --silent

        mkdir -p "$DATA_DIR/mission-control"

        cat > .env.local <<EOF
GATEWAY_URL=http://127.0.0.1:18789
GATEWAY_TOKEN=${GATEWAY_TOKEN}
DB_PATH=${DATA_DIR}/mission-control/mission-control.db
EOF

        info "Running database migrations…"
        pnpm drizzle-kit generate --silent 2>/dev/null || true
        DB_PATH="${DATA_DIR}/mission-control/mission-control.db" pnpm drizzle-kit migrate --silent 2>/dev/null || true
        ok "Mission Control ready"
    fi

    # ── Start gateway via PM2 ─────────────────────────────────────────────────
    echo ""
    info "Starting gateway via PM2…"
    pm2 delete clawhalla-gateway 2>/dev/null || true
    pm2 start openclaw --name clawhalla-gateway -- gateway
    pm2 save --force &>/dev/null

    info "Waiting for gateway…"
    TRIES=0
    while [ $TRIES -lt 20 ]; do
        if curl -sf -H "Authorization: Bearer ${GATEWAY_TOKEN}" http://127.0.0.1:18789/health &>/dev/null; then
            ok "Gateway is live"; break
        fi
        TRIES=$((TRIES+1)); sleep 3
    done
    [ $TRIES -eq 20 ] && warn "Gateway health check timed out — check: pm2 logs clawhalla-gateway"

    # ── Start MC via PM2 ──────────────────────────────────────────────────────
    MC_URL=""
    if [ "$INSTALL_MC" = "true" ]; then
        MC_BIND_HOST="127.0.0.1"
        [ "$MC_ACCESS" = "remote" ] && MC_BIND_HOST="0.0.0.0"

        pm2 delete clawhalla-mc 2>/dev/null || true
        pm2 start pnpm --name clawhalla-mc --cwd "${INSTALL_DIR}/apps/mission-control" \
            -- dev --hostname "$MC_BIND_HOST" --port 3000
        pm2 save --force &>/dev/null

        info "Waiting for Mission Control…"
        TRIES=0
        while [ $TRIES -lt 30 ]; do
            if curl -sf http://127.0.0.1:3000/api/health &>/dev/null; then
                ok "Mission Control is live"; break
            fi
            TRIES=$((TRIES+1)); sleep 3
        done
        [ $TRIES -eq 30 ] && warn "MC health check timed out — check: pm2 logs clawhalla-mc"

        MC_URL="http://localhost:3000"
        [ "$MC_ACCESS" = "remote" ] && MC_URL="http://$(curl -sf --max-time 3 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}'):3000"
    fi

    # ── PM2 startup (auto-start on boot) ─────────────────────────────────────
    info "Configuring PM2 startup…"
    PM2_STARTUP=$(pm2 startup 2>/dev/null | tail -1)
    if echo "$PM2_STARTUP" | grep -q "sudo"; then
        eval "$PM2_STARTUP" &>/dev/null && ok "PM2 configured to start on boot" || warn "Run manually: ${PM2_STARTUP}"
    fi

fi # end install mode

# ─────────────────────────────────────────────────────────────────────────────
# 8. VPS FIREWALL
# ─────────────────────────────────────────────────────────────────────────────
if [ "$ENV_TYPE" = "vps" ] && command -v ufw &>/dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1)
    if echo "$UFW_STATUS" | grep -qi "active"; then
        echo ""
        box_top
        box_title "Firewall (UFW detected)"
        box_div
        box_text "To access Mission Control from outside this server,"
        box_text "port 3000 needs to be open."
        box_empty
        box_bot
        echo ""
        ask "Open port 3000 in UFW? (Y/n)" "Y" _UFW
        if [[ ! "$_UFW" =~ ^[Nn]$ ]]; then
            sudo ufw allow 3000/tcp &>/dev/null && ok "Port 3000 opened" || warn "Could not open port — run: sudo ufw allow 3000/tcp"
        fi
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 9. SAVE INSTALL INFO
# ─────────────────────────────────────────────────────────────────────────────
cat > "${INSTALL_DIR}/.install-info.json" <<EOF
{
  "version": "1.1.0",
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "workspace": "${WORKSPACE_NAME}",
  "mode": "${INSTALL_MODE}",
  "env_type": "${ENV_TYPE}",
  "os": "${OS}",
  "os_version": "${OS_VERSION}",
  "services": {
    "gateway": true,
    "mission_control": ${INSTALL_MC},
    "ollama": ${INSTALL_OLLAMA}
  },
  "mc_access": "${MC_ACCESS}"
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 10. SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ""
echo -e "  ${G}┌────────────────────────────────────────────────────────┐${NC}"
echo -e "  ${G}│                                                        │${NC}"
echo -e "  ${G}│   ClawHalla is ready!                                  │${NC}"
echo -e "  ${G}│                                                        │${NC}"
printf  "  ${G}│${NC}   Workspace   %-41s${G}│${NC}\n" "${WORKSPACE_NAME}"
printf  "  ${G}│${NC}   Mode        %-41s${G}│${NC}\n" "${INSTALL_MODE} · ${ENV_TYPE}"
printf  "  ${G}│${NC}   Gateway     %-41s${G}│${NC}\n" "ws://127.0.0.1:18789"

if [ "$MC_ACCESS" = "cloud" ]; then
    printf  "  ${G}│${NC}   MC          %-41s${G}│${NC}\n" "controls.clawhalla.xyz"
    printf  "  ${G}│${NC}              %-41s${G}│${NC}\n" "→ connect gateway: ws://YOUR_IP:18789"
elif [ -n "$MC_URL" ]; then
    printf  "  ${G}│${NC}   MC          %-41s${G}│${NC}\n" "${MC_URL}"
fi

echo -e "  ${G}│                                                        │${NC}"
echo -e "  ${G}│   Next: open the URL above and complete setup in MC.  │${NC}"
echo -e "  ${G}│                                                        │${NC}"
echo -e "  ${G}└────────────────────────────────────────────────────────┘${NC}"
echo ""

if [ "$INSTALL_MODE" = "bare" ]; then
    echo -e "  ${D}Manage:  pm2 list  ·  pm2 logs  ·  pm2 restart all${NC}"
else
    echo -e "  ${D}Manage:  cd ${INSTALL_DIR} && docker compose logs -f${NC}"
fi

# ── Auto-open browser on local machine ────────────────────────────────────────
if [ "$ENV_TYPE" = "local" ] && [ -n "$MC_URL" ]; then
    echo ""
    if [[ "$OS" == "macos" ]]; then
        open "$MC_URL" 2>/dev/null || true
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$MC_URL" 2>/dev/null || true
    fi
fi

echo ""
exit 0
