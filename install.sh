#!/bin/bash
set -e

# ClawHalla Installation Script
# Docker:      curl -fsSL https://clawhalla.xyz/install.sh | bash
# Bare metal:  curl -fsSL https://clawhalla.xyz/install.sh | bash -s -- --bare

# ============================================================================
# COLORS & LOGGING
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1"; }
log_header()  {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Installation failed. Check the output above for details."
    fi
}
trap cleanup EXIT

# ============================================================================
# PARSE ARGS
# ============================================================================
INSTALL_MODE=""
for arg in "$@"; do
    case $arg in
        --bare|--no-docker) INSTALL_MODE="bare" ;;
        --docker)           INSTALL_MODE="docker" ;;
    esac
done

# ============================================================================
# BANNER
# ============================================================================
clear
cat << "EOF"
   ____  _                __  __       _ _
  / __ \| |              |  \/  |     | | |
 | |  | | | __ ___      _| \  / | __ _| | | __ _
 | |  | | |/ _` \ \ /\ / / |\/| |/ _` | | |/ _` |
 | |__| | | (_| |\ V  V /| |  | | (_| | | | (_| |
  \____/|_|\__,_| \_/\_/ |_|  |_|\__,_|_|_|\__,_|

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Squad-Based AI Agent Platform for OpenClaw
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
echo ""

# Do not run as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root or with sudo"
    exit 1
fi

# Ensure stdin is a tty (needed when piping via curl | bash)
if [ ! -t 0 ]; then
    exec < /dev/tty
fi

# ============================================================================
# 1. OS DETECTION
# ============================================================================
log_header "🔍 System Detection"

detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
            OS_VERSION=$VERSION_ID
            case $OS in
                ubuntu|debian)
                    log_success "Detected: $NAME $VERSION"
                    PACKAGE_MANAGER="apt"
                    ;;
                *)
                    log_warning "Detected Linux: $NAME"
                    log_warning "Only Ubuntu/Debian are officially supported"
                    PACKAGE_MANAGER="apt"
                    ;;
            esac
        else
            log_error "Cannot detect Linux distribution"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        OS_VERSION=$(sw_vers -productVersion)
        log_success "Detected: macOS $OS_VERSION"
        PACKAGE_MANAGER="brew"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
}

detect_os

# ============================================================================
# 2. INSTALL MODE SELECTION
# ============================================================================
log_header "🚀 Install Mode"

if [ -z "$INSTALL_MODE" ]; then
    DOCKER_AVAILABLE=false
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        DOCKER_AVAILABLE=true
    fi

    if [ "$DOCKER_AVAILABLE" = "true" ]; then
        echo "  1) Docker       — isolated container (recommended for production)"
        echo "  2) Bare metal   — direct install on this machine (faster, good for VPS/hackathons)"
        echo ""
        while true; do
            read -p "$(echo -e ${CYAN}📦 Install mode ${NC}[1]: )" MODE_CHOICE
            MODE_CHOICE=${MODE_CHOICE:-1}
            case $MODE_CHOICE in
                1) INSTALL_MODE="docker"  ; break ;;
                2) INSTALL_MODE="bare"    ; break ;;
                *) log_error "Enter 1 or 2" ;;
            esac
        done
    else
        log_info "Docker not found — switching to bare metal install"
        INSTALL_MODE="bare"
    fi
fi

log_success "Mode: $INSTALL_MODE"

# ============================================================================
# 3. INTERACTIVE WIZARD (shared)
# ============================================================================
log_header "⚙️  Configuration Wizard"

# Project / install directory
while true; do
    read -p "$(echo -e ${CYAN}📦 Project name ${NC}[clawhalla]: )" PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-clawhalla}
    if [[ "$PROJECT_NAME" =~ ^[a-z0-9_-]+$ ]]; then
        break
    else
        log_error "Use only lowercase letters, numbers, hyphens, and underscores."
    fi
done

INSTALL_DIR="$HOME/$PROJECT_NAME"

if [ -d "$INSTALL_DIR" ]; then
    log_warning "Directory $INSTALL_DIR already exists"
    read -p "$(echo -e ${YELLOW}⚠ Overwrite? ${NC}[y/N]: )" -r OVERWRITE
    if [[ ! $OVERWRITE =~ ^[Yy]$ ]]; then
        log_error "Installation cancelled"
        exit 1
    fi
    rm -rf "$INSTALL_DIR"
fi

# Model choice
echo ""
log_info "Select default Claude model:"
echo "  1) claude-sonnet-4-6  (Balanced, recommended — best value)"
echo "  2) claude-opus-4-6    (Most capable, higher cost)"
echo "  3) claude-haiku-4-5   (Fast, lowest cost)"
echo ""
while true; do
    read -p "$(echo -e ${CYAN}🤖 Model ${NC}[1]: )" MODEL_CHOICE
    MODEL_CHOICE=${MODEL_CHOICE:-1}
    case $MODEL_CHOICE in
        1) CLAUDE_MODEL="anthropic/claude-sonnet-4-6"  ; MODEL_ID="claude-sonnet-4-6" ; break ;;
        2) CLAUDE_MODEL="anthropic/claude-opus-4-6"    ; MODEL_ID="claude-opus-4-6"   ; break ;;
        3) CLAUDE_MODEL="anthropic/claude-haiku-4-5"   ; MODEL_ID="claude-haiku-4-5"  ; break ;;
        *) log_error "Enter 1, 2, or 3." ;;
    esac
done

# Auth method
echo ""
log_info "Select authentication method:"
echo "  1) API Key       — Anthropic API key (simple, pay-per-use)"
echo "  2) Claude Max    — OAuth token from Claude Max subscription"
echo ""
while true; do
    read -p "$(echo -e ${CYAN}🔐 Auth method ${NC}[1]: )" AUTH_CHOICE
    AUTH_CHOICE=${AUTH_CHOICE:-1}
    case $AUTH_CHOICE in
        1)
            AUTH_METHOD="apikey"
            read -sp "$(echo -e ${CYAN}🔑 Anthropic API key: ${NC})" ANTHROPIC_API_KEY
            echo ""
            if [ -z "$ANTHROPIC_API_KEY" ]; then
                log_error "API key cannot be empty"
                continue
            fi
            break
            ;;
        2)
            AUTH_METHOD="oauth"
            log_info "You will need your Claude Max OAuth token."
            log_info "Get it from: https://claude.ai → Settings → API → OAuth Token"
            read -sp "$(echo -e ${CYAN}🔑 OAuth token: ${NC})" ANTHROPIC_API_KEY
            echo ""
            if [ -z "$ANTHROPIC_API_KEY" ]; then
                log_error "Token cannot be empty"
                continue
            fi
            break
            ;;
        *) log_error "Enter 1 or 2." ;;
    esac
done

log_success "Configuration collected"

# ============================================================================
# 4. GENERATE SECURE TOKENS
# ============================================================================
log_header "🔐 Generating Secure Tokens"

if command -v openssl &>/dev/null; then
    GATEWAY_TOKEN=$(openssl rand -hex 32)
    VAULT_KEY=$(openssl rand -hex 32)
    log_success "Tokens generated via OpenSSL"
else
    GATEWAY_TOKEN=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
    VAULT_KEY=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
    log_success "Tokens generated via /dev/urandom"
fi

# ============================================================================
# 5. CLONE REPOSITORY
# ============================================================================
log_header "📥 Cloning Repository"

git clone https://github.com/deegalabs/clawhalla.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
log_success "Repository cloned to $INSTALL_DIR"

# ============================================================================
# DOCKER PATH
# ============================================================================
if [ "$INSTALL_MODE" = "docker" ]; then

    log_header "🐋 Docker Setup"

    check_docker() {
        command -v docker &>/dev/null && docker info &>/dev/null 2>&1
    }

    install_docker_linux() {
        log_info "Installing Docker on $OS..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        sudo usermod -aG docker $USER
        log_success "Docker installed"
        log_warning "You may need to log out and back in for group changes to take effect"
    }

    if ! check_docker; then
        if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
            install_docker_linux
        elif [[ "$OS" == "macos" ]]; then
            log_error "Please install Docker Desktop from https://docker.com and re-run"
            exit 1
        fi
        if ! check_docker; then
            log_error "Docker installation failed"
            exit 1
        fi
    fi

    DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | cut -d ',' -f1)
    log_success "Docker: v$DOCKER_VERSION"

    if ! docker compose version &>/dev/null; then
        log_error "Docker Compose not found"
        exit 1
    fi
    log_success "Docker Compose: $(docker compose version --short)"

    # Create .env
    log_header "📝 Creating Environment"

    cat > .env << EOF
# ClawHalla Environment — generated $(date -u +"%Y-%m-%d %H:%M:%S UTC")
PROJECT_NAME=$PROJECT_NAME
GATEWAY_TOKEN=$GATEWAY_TOKEN
VAULT_KEY=$VAULT_KEY
CLAUDE_MODEL=$CLAUDE_MODEL
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
MC_PORT=3000
MC_ENABLED=true
WORKSPACE_PATH=/workspace
WORKSPACE_TEMPLATE=workspace-template
COMPOSE_PROJECT_NAME=$PROJECT_NAME
EOF
    log_success ".env created"

    # Build
    log_header "🔨 Building Docker Image"
    log_info "This may take a few minutes on first run..."
    docker compose build --quiet
    log_success "Image built"

    # Start
    log_header "🚀 Starting Container"
    docker compose up -d
    log_success "Container started"
    sleep 5

    # Configure openclaw inside container (replaces interactive onboard)
    log_header "🎯 Configuring OpenClaw"
    log_info "Writing configuration (skipping interactive onboard)..."

    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ "$AUTH_METHOD" = "apikey" ]; then
        AUTH_PROFILE_TYPE="api_key"
        AUTH_PROFILE_FIELD="\"key\": \"$ANTHROPIC_API_KEY\""
        MODELS_API_KEY="\"apiKey\": \"$ANTHROPIC_API_KEY\","
    else
        AUTH_PROFILE_TYPE="token"
        AUTH_PROFILE_FIELD="\"token\": \"$ANTHROPIC_API_KEY\""
        MODELS_API_KEY=""
    fi

    docker compose exec -T clawhalla bash -c "
mkdir -p /home/clawdbot/.openclaw/agents/main/agent /home/clawdbot/.openclaw/agents/main/sessions

cat > /home/clawdbot/.openclaw/openclaw.json << 'JSONEOF'
{
  \"meta\": { \"lastTouchedVersion\": \"2026.3.13\", \"lastTouchedAt\": \"$TIMESTAMP\" },
  \"wizard\": { \"lastRunAt\": \"$TIMESTAMP\", \"lastRunVersion\": \"2026.3.13\", \"lastRunCommand\": \"onboard\", \"lastRunMode\": \"local\" },
  \"auth\": { \"profiles\": { \"anthropic:manual\": { \"provider\": \"anthropic\", \"mode\": \"$AUTH_METHOD\" } } },
  \"gateway\": {
    \"port\": 18789, \"mode\": \"local\", \"bind\": \"loopback\",
    \"auth\": { \"mode\": \"token\", \"token\": \"$GATEWAY_TOKEN\" }
  }
}
JSONEOF

cat > /home/clawdbot/.openclaw/agents/main/agent/auth-profiles.json << 'APEOF'
{
  \"version\": 1,
  \"profiles\": {
    \"anthropic:manual\": { \"type\": \"$AUTH_PROFILE_TYPE\", \"provider\": \"anthropic\", $AUTH_PROFILE_FIELD }
  },
  \"lastGood\": { \"anthropic\": \"anthropic:manual\" }
}
APEOF

cat > /home/clawdbot/.openclaw/agents/main/agent/models.json << 'MJEOF'
{
  \"providers\": {
    \"anthropic\": {
      \"baseUrl\": \"https://api.anthropic.com\",
      \"api\": \"anthropic-messages\",
      $MODELS_API_KEY
      \"models\": [
        { \"id\": \"claude-sonnet-4-6\", \"name\": \"Claude Sonnet 4.6\", \"api\": \"anthropic-messages\", \"contextWindow\": 200000, \"maxTokens\": 64000 },
        { \"id\": \"claude-opus-4-6\",   \"name\": \"Claude Opus 4.6\",   \"api\": \"anthropic-messages\", \"contextWindow\": 200000, \"maxTokens\": 128000 },
        { \"id\": \"claude-haiku-4-5\",  \"name\": \"Claude Haiku 4.5\",  \"api\": \"anthropic-messages\", \"contextWindow\": 200000, \"maxTokens\": 8096 }
      ]
    }
  }
}
MJEOF
echo 'Configuration written'
"
    log_success "OpenClaw configured (no interactive onboard needed)"

    # Copy workspace template
    log_header "📋 Setting Up Workspace"
    docker compose exec -T clawhalla bash -c "
        if [ -d /app/workspace-template ]; then
            cp -r /app/workspace-template/* /home/clawdbot/.openclaw/workspace/ 2>/dev/null || true
            echo 'Workspace template copied'
        fi
    "
    log_success "15 pre-trained agents installed"

    # Start gateway inside container
    log_header "🌐 Starting OpenClaw Gateway"
    docker compose exec -T clawhalla bash -c "
        nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
        sleep 6
        curl -sf http://127.0.0.1:18789/health && echo 'Gateway: OK' || echo 'Gateway: starting...'
    "

    # Start Mission Control inside container
    log_header "🎮 Starting Mission Control"
    docker compose exec -T clawhalla bash -c "
        cd /home/clawdbot/mission-control
        cat > .env.local << 'ENVEOF'
GATEWAY_URL=http://127.0.0.1:18789
GATEWAY_TOKEN=$GATEWAY_TOKEN
DB_PATH=./data/mission-control.db
ENVEOF
        mkdir -p data
        pnpm install --silent 2>/dev/null || true
        pnpm drizzle-kit generate --silent 2>/dev/null || true
        pnpm drizzle-kit migrate --silent 2>/dev/null || true
        nohup pnpm dev --hostname 0.0.0.0 --port 3000 > /tmp/mission-control.log 2>&1 &
        echo 'Mission Control started'
    " 2>/dev/null || log_warning "Mission Control will need to be started manually inside the container"

    MC_URL="http://localhost:3333"
    GATEWAY_DISPLAY="ws://localhost:18789 (Docker: port forwarded)"

# ============================================================================
# BARE METAL PATH
# ============================================================================
else

    log_header "🖥️  Bare Metal Setup"

    # ── Node 24 via nvm ──────────────────────────────────────────────────────
    log_info "Checking Node.js..."

    export NVM_DIR="$HOME/.nvm"

    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        log_info "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        log_success "nvm installed"
    else
        \. "$NVM_DIR/nvm.sh"
    fi

    NODE_MAJOR=$(node --version 2>/dev/null | cut -d. -f1 | tr -d 'v' || echo "0")
    if [ "$NODE_MAJOR" -lt 22 ]; then
        log_info "Installing Node 24..."
        nvm install 24
        nvm alias default 24
        nvm use 24
        log_success "Node $(node --version) installed"
    else
        log_success "Node $(node --version) — OK"
    fi

    # ── pnpm ─────────────────────────────────────────────────────────────────
    if ! command -v pnpm &>/dev/null; then
        log_info "Enabling pnpm via corepack..."
        corepack enable pnpm
        log_success "pnpm $(pnpm --version) enabled"
    else
        log_success "pnpm $(pnpm --version) — OK"
    fi

    # ── OpenClaw CLI ──────────────────────────────────────────────────────────
    if ! command -v openclaw &>/dev/null; then
        log_info "Installing OpenClaw CLI..."
        pnpm add -g openclaw@latest
        log_success "OpenClaw $(openclaw --version 2>/dev/null | head -1) installed"
    else
        log_success "OpenClaw $(openclaw --version 2>/dev/null | head -1) — OK"
    fi

    # ── Configure OpenClaw (bypass interactive onboard) ───────────────────────
    log_header "🎯 Configuring OpenClaw"

    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    OPENCLAW_DIR="$HOME/.openclaw"

    mkdir -p "$OPENCLAW_DIR/agents/main/agent" \
             "$OPENCLAW_DIR/agents/main/sessions" \
             "$OPENCLAW_DIR/workspace" \
             "$OPENCLAW_DIR/logs"

    if [ "$AUTH_METHOD" = "apikey" ]; then
        AUTH_PROFILE_JSON="{\"type\": \"api_key\", \"provider\": \"anthropic\", \"key\": \"$ANTHROPIC_API_KEY\"}"
        MODELS_APIKEY_FIELD="\"apiKey\": \"$ANTHROPIC_API_KEY\","
        OPENCLAW_AUTH_MODE="api_key"
    else
        AUTH_PROFILE_JSON="{\"type\": \"token\", \"provider\": \"anthropic\", \"token\": \"$ANTHROPIC_API_KEY\"}"
        MODELS_APIKEY_FIELD=""
        OPENCLAW_AUTH_MODE="token"
    fi

    # openclaw.json
    cat > "$OPENCLAW_DIR/openclaw.json" << EOF
{
  "meta": {
    "lastTouchedVersion": "2026.3.13",
    "lastTouchedAt": "$TIMESTAMP"
  },
  "wizard": {
    "lastRunAt": "$TIMESTAMP",
    "lastRunVersion": "2026.3.13",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {
      "anthropic:manual": {
        "provider": "anthropic",
        "mode": "$OPENCLAW_AUTH_MODE"
      }
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "$GATEWAY_TOKEN"
    },
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  }
}
EOF

    # auth-profiles.json
    cat > "$OPENCLAW_DIR/agents/main/agent/auth-profiles.json" << EOF
{
  "version": 1,
  "profiles": {
    "anthropic:manual": $AUTH_PROFILE_JSON
  },
  "lastGood": {
    "anthropic": "anthropic:manual"
  }
}
EOF

    # models.json
    cat > "$OPENCLAW_DIR/agents/main/agent/models.json" << EOF
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "api": "anthropic-messages",
      $MODELS_APIKEY_FIELD
      "models": [
        {
          "id": "claude-sonnet-4-6",
          "name": "Claude Sonnet 4.6",
          "api": "anthropic-messages",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
          "contextWindow": 200000,
          "maxTokens": 64000
        },
        {
          "id": "claude-opus-4-6",
          "name": "Claude Opus 4.6",
          "api": "anthropic-messages",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 5, "output": 25, "cacheRead": 0.5, "cacheWrite": 6.25 },
          "contextWindow": 200000,
          "maxTokens": 128000
        },
        {
          "id": "claude-haiku-4-5",
          "name": "Claude Haiku 4.5",
          "api": "anthropic-messages",
          "reasoning": false,
          "input": ["text", "image"],
          "cost": { "input": 0.8, "output": 4, "cacheRead": 0.08, "cacheWrite": 1 },
          "contextWindow": 200000,
          "maxTokens": 8096
        }
      ]
    }
  }
}
EOF

    log_success "OpenClaw configured"

    # ── Copy workspace template ───────────────────────────────────────────────
    log_header "📋 Setting Up Workspace"

    if [ -d "$INSTALL_DIR/workspace-template" ]; then
        cp -r "$INSTALL_DIR/workspace-template/." "$OPENCLAW_DIR/workspace/"
        log_success "15 pre-trained agents installed from workspace template"
    else
        log_warning "workspace-template not found in repo — workspace will be empty"
    fi

    # ── Mission Control ───────────────────────────────────────────────────────
    log_header "🎮 Setting Up Mission Control"

    MC_DIR="$INSTALL_DIR/apps/mission-control"
    cd "$MC_DIR"

    log_info "Installing dependencies..."
    pnpm install --silent

    mkdir -p data

    log_info "Setting up database..."
    pnpm drizzle-kit generate --silent 2>/dev/null || true
    pnpm drizzle-kit migrate --silent 2>/dev/null || true

    # .env.local for Mission Control
    cat > .env.local << EOF
GATEWAY_URL=http://127.0.0.1:18789
GATEWAY_TOKEN=$GATEWAY_TOKEN
DB_PATH=./data/mission-control.db
EOF

    log_success "Mission Control ready"

    # ── Start gateway ─────────────────────────────────────────────────────────
    log_header "🌐 Starting OpenClaw Gateway"

    mkdir -p /tmp/openclaw
    nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
    GATEWAY_PID=$!

    log_info "Waiting for gateway (PID: $GATEWAY_PID)..."

    RETRIES=0
    while [ $RETRIES -lt 20 ]; do
        if curl -sf -H "Authorization: Bearer $GATEWAY_TOKEN" http://127.0.0.1:18789/health &>/dev/null; then
            log_success "Gateway is live"
            break
        fi
        RETRIES=$((RETRIES + 1))
        sleep 2
    done

    if [ $RETRIES -eq 20 ]; then
        log_warning "Gateway health check timed out — it may still be starting"
    fi

    # ── Start Mission Control ─────────────────────────────────────────────────
    log_header "🖥️  Starting Mission Control"

    nohup pnpm dev --hostname 0.0.0.0 --port 3000 > /tmp/mission-control.log 2>&1 &
    MC_PID=$!

    log_info "Waiting for Mission Control (PID: $MC_PID)..."

    RETRIES=0
    while [ $RETRIES -lt 25 ]; do
        if curl -sf http://127.0.0.1:3000/api/health &>/dev/null; then
            log_success "Mission Control is live"
            break
        fi
        RETRIES=$((RETRIES + 1))
        sleep 2
    done

    if [ $RETRIES -eq 25 ]; then
        log_warning "Mission Control health check timed out — check /tmp/mission-control.log"
    fi

    # Save PIDs for easy management
    cat > "$INSTALL_DIR/.pids" << EOF
GATEWAY_PID=$GATEWAY_PID
MC_PID=$MC_PID
EOF

    MC_URL="http://localhost:3000"
    GATEWAY_DISPLAY="ws://127.0.0.1:18789"

fi # end install mode

# ============================================================================
# INSTALLATION COMPLETE
# ============================================================================
log_header "✨ Installation Complete!"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 ClawHalla is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📍 Install dir:${NC}      $INSTALL_DIR"
echo -e "${CYAN}🌐 Mission Control:${NC}  $MC_URL"
echo -e "${CYAN}🔌 Gateway:${NC}          $GATEWAY_DISPLAY"
echo -e "${CYAN}🤖 Model:${NC}            $CLAUDE_MODEL"
echo -e "${CYAN}🔐 Auth:${NC}             $AUTH_METHOD"
echo ""

if [ "$INSTALL_MODE" = "bare" ]; then
    echo -e "${YELLOW}Manage services:${NC}"
    echo ""
    echo -e "  Restart gateway:   ${BLUE}nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &${NC}"
    echo -e "  Restart MC:        ${BLUE}cd $INSTALL_DIR/apps/mission-control && pnpm dev${NC}"
    echo -e "  Gateway logs:      ${BLUE}tail -f /tmp/openclaw-gateway.log${NC}"
    echo -e "  MC logs:           ${BLUE}tail -f /tmp/mission-control.log${NC}"
    echo ""
else
    echo -e "${YELLOW}Manage Docker:${NC}"
    echo ""
    echo -e "  ${BLUE}cd $INSTALL_DIR${NC}"
    echo -e "  ${BLUE}docker compose logs -f${NC}"
    echo -e "  ${BLUE}docker compose stop${NC}"
    echo -e "  ${BLUE}docker compose start${NC}"
    echo -e "  ${BLUE}docker compose exec clawhalla bash${NC}"
    echo ""
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📚 Docs:${NC}      https://clawhalla.xyz/docs"
echo -e "${CYAN}🐛 Issues:${NC}    https://github.com/deegalabs/clawhalla/issues"
echo ""
echo -e "${YELLOW}⭐ If ClawHalla helps you, star us on GitHub!${NC}"
echo ""

# Save install info
cat > "$INSTALL_DIR/.install-info.json" << EOF
{
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.1.0",
  "mode": "$INSTALL_MODE",
  "project_name": "$PROJECT_NAME",
  "model": "$CLAUDE_MODEL",
  "auth_method": "$AUTH_METHOD",
  "os": "$OS",
  "os_version": "$OS_VERSION"
}
EOF

exit 0
