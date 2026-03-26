#!/bin/bash
set -e

# ClawHalla Installation Script
# curl -sSL https://clawhalla.xyz/install.sh | bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Installation failed. Cleaning up..."
        # Add cleanup logic here if needed
    fi
}
trap cleanup EXIT

# Banner
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

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    log_error "Please do not run this script as root or with sudo"
    exit 1
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
# 2. DOCKER CHECK & AUTO-INSTALL
# ============================================================================
log_header "🐋 Docker Check"

check_docker() {
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | cut -d ',' -f1)
        log_success "Docker found: v$DOCKER_VERSION"
        
        # Check if docker daemon is running
        if ! docker info &> /dev/null; then
            log_error "Docker is installed but not running"
            log_info "Please start Docker and run this script again"
            exit 1
        fi
        
        return 0
    else
        return 1
    fi
}

install_docker() {
    log_info "Docker not found. Installing Docker..."
    
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        log_info "Installing Docker on $OS..."
        
        # Update package index
        sudo apt-get update -qq
        
        # Install prerequisites
        sudo apt-get install -y -qq \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        
        # Add Docker's official GPG key
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        
        # Set up the repository
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker Engine
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        # Add current user to docker group
        sudo usermod -aG docker $USER
        
        log_success "Docker installed successfully"
        log_warning "You may need to log out and back in for group changes to take effect"
        
    elif [[ "$OS" == "macos" ]]; then
        log_info "Installing Docker on macOS..."
        
        if ! command -v brew &> /dev/null; then
            log_error "Homebrew not found. Please install Homebrew first:"
            log_info "https://brew.sh"
            exit 1
        fi
        
        brew install --cask docker
        
        log_success "Docker installed successfully"
        log_warning "Please start Docker Desktop from Applications and run this script again"
        exit 0
    fi
}

if ! check_docker; then
    install_docker
    
    # Verify installation
    if ! check_docker; then
        log_error "Docker installation failed"
        exit 1
    fi
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version --short)
    log_success "Docker Compose found: v$COMPOSE_VERSION"
else
    log_error "Docker Compose not found"
    exit 1
fi

# ============================================================================
# 3. INTERACTIVE WIZARD
# ============================================================================
log_header "⚙️  Configuration Wizard"

# Project name
while true; do
    read -p "$(echo -e ${CYAN}📦 Project name ${NC}[clawhalla]: )" PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-clawhalla}
    
    if [[ "$PROJECT_NAME" =~ ^[a-z0-9_-]+$ ]]; then
        break
    else
        log_error "Invalid project name. Use only lowercase letters, numbers, hyphens, and underscores."
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
log_info "Select Claude model:"
echo "  1) claude-opus-4-5 (Most capable, slower, higher cost)"
echo "  2) claude-sonnet-4-5 (Balanced, recommended)"
echo "  3) claude-haiku-4-5 (Fast, lower cost)"
echo ""
while true; do
    read -p "$(echo -e ${CYAN}🤖 Model choice ${NC}[2]: )" MODEL_CHOICE
    MODEL_CHOICE=${MODEL_CHOICE:-2}
    
    case $MODEL_CHOICE in
        1)
            CLAUDE_MODEL="anthropic/claude-opus-4-5"
            break
            ;;
        2)
            CLAUDE_MODEL="anthropic/claude-sonnet-4-5"
            break
            ;;
        3)
            CLAUDE_MODEL="anthropic/claude-haiku-4-5"
            break
            ;;
        *)
            log_error "Invalid choice. Please enter 1, 2, or 3."
            ;;
    esac
done

# Auth method
echo ""
log_info "Select authentication method:"
echo "  1) API Key (simple, direct)"
echo "  2) OAuth (secure, browser-based)"
echo ""
while true; do
    read -p "$(echo -e ${CYAN}🔐 Auth method ${NC}[1]: )" AUTH_CHOICE
    AUTH_CHOICE=${AUTH_CHOICE:-1}
    
    case $AUTH_CHOICE in
        1)
            AUTH_METHOD="apikey"
            read -sp "$(echo -e ${CYAN}🔑 Enter your Anthropic API key: ${NC})" ANTHROPIC_API_KEY
            echo ""
            
            if [ -z "$ANTHROPIC_API_KEY" ]; then
                log_error "API key cannot be empty"
                continue
            fi
            break
            ;;
        2)
            AUTH_METHOD="oauth"
            log_info "OAuth will be configured during onboarding"
            ANTHROPIC_API_KEY=""
            break
            ;;
        *)
            log_error "Invalid choice. Please enter 1 or 2."
            ;;
    esac
done

log_success "Configuration collected"

# ============================================================================
# 4. GENERATE SECURE TOKENS
# ============================================================================
log_header "🔐 Generating Secure Tokens"

if command -v openssl &> /dev/null; then
    GATEWAY_TOKEN=$(openssl rand -hex 32)
    VAULT_KEY=$(openssl rand -hex 32)
    log_success "Tokens generated using OpenSSL"
else
    # Fallback to /dev/urandom
    GATEWAY_TOKEN=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
    VAULT_KEY=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
    log_success "Tokens generated using /dev/urandom"
fi

# ============================================================================
# 5. CLONE REPO & CREATE .ENV
# ============================================================================
log_header "📥 Cloning Repository"

git clone https://github.com/deegalabs/clawhalla.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

log_success "Repository cloned to $INSTALL_DIR"

# Create .env from template
log_info "Creating .env file..."

cat > .env << EOF
# ClawHalla Environment Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Project
PROJECT_NAME=$PROJECT_NAME

# OpenClaw Gateway
GATEWAY_TOKEN=$GATEWAY_TOKEN
VAULT_KEY=$VAULT_KEY

# Claude AI
CLAUDE_MODEL=$CLAUDE_MODEL
EOF

if [ "$AUTH_METHOD" == "apikey" ] && [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> .env
fi

cat >> .env << EOF

# Mission Control
MC_PORT=3000
MC_ENABLED=true

# Workspace
WORKSPACE_PATH=/workspace
WORKSPACE_TEMPLATE=workspace-template

# Docker
COMPOSE_PROJECT_NAME=$PROJECT_NAME
EOF

log_success ".env file created"

# ============================================================================
# 6. BUILD DOCKER IMAGE
# ============================================================================
log_header "🔨 Building Docker Image"

log_info "This may take a few minutes on first run..."

if docker compose build --quiet; then
    log_success "Docker image built successfully"
else
    log_error "Docker build failed"
    exit 1
fi

# ============================================================================
# 7. START CONTAINER
# ============================================================================
log_header "🚀 Starting Container"

if docker compose up -d; then
    log_success "Container started"
else
    log_error "Failed to start container"
    exit 1
fi

# Wait for container to be ready
log_info "Waiting for container to be ready..."
sleep 5

# ============================================================================
# 8. AUTO-RUN ONBOARD
# ============================================================================
log_header "🎯 Running Onboarding"

log_info "Starting OpenClaw onboarding process..."

if docker compose exec -T openclaw openclaw onboard --non-interactive; then
    log_success "Onboarding completed"
else
    log_warning "Onboarding had issues, but container is running"
fi

# ============================================================================
# 9. COPY WORKSPACE TEMPLATE
# ============================================================================
log_header "📋 Setting Up Workspace"

log_info "Copying workspace template with pre-trained agents..."

if docker compose exec -T openclaw bash -c "
    if [ -d /app/workspace-template ]; then
        cp -r /app/workspace-template/* /workspace/
        echo 'Workspace template copied'
    else
        echo 'Warning: workspace-template not found'
    fi
"; then
    log_success "Workspace initialized with 15 pre-trained agents"
else
    log_warning "Workspace template copy had issues"
fi

# ============================================================================
# 10. START MISSION CONTROL
# ============================================================================
log_header "🎮 Starting Mission Control"

# Check if Mission Control is responding
log_info "Waiting for Mission Control to start..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:3000/health &> /dev/null; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_warning "Mission Control health check timeout"
    log_info "Container is running, but web interface may need more time"
else
    log_success "Mission Control is ready"
fi

# ============================================================================
# INSTALLATION COMPLETE
# ============================================================================
log_header "✨ Installation Complete!"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 ClawHalla is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📍 Installation directory:${NC} $INSTALL_DIR"
echo -e "${CYAN}🌐 Mission Control:${NC} http://localhost:3000"
echo -e "${CYAN}🤖 Model:${NC} $CLAUDE_MODEL"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  1. Access Mission Control:"
echo -e "     ${BLUE}→${NC} Open http://localhost:3000 in your browser"
echo ""
echo "  2. Manage the platform:"
echo -e "     ${BLUE}→${NC} cd $INSTALL_DIR"
echo -e "     ${BLUE}→${NC} docker compose logs -f    # View logs"
echo -e "     ${BLUE}→${NC} docker compose stop       # Stop container"
echo -e "     ${BLUE}→${NC} docker compose start      # Start container"
echo -e "     ${BLUE}→${NC} docker compose restart    # Restart container"
echo ""
echo "  3. Enter the container:"
echo -e "     ${BLUE}→${NC} docker compose exec openclaw bash"
echo ""
echo "  4. Access OpenClaw CLI inside container:"
echo -e "     ${BLUE}→${NC} openclaw --help"
echo -e "     ${BLUE}→${NC} openclaw agent list"
echo -e "     ${BLUE}→${NC} openclaw gateway status"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📚 Documentation:${NC} https://clawhalla.xyz/docs"
echo -e "${CYAN}💬 Community:${NC} https://discord.gg/clawhalla"
echo -e "${CYAN}🐛 Issues:${NC} https://github.com/deegalabs/clawhalla/issues"
echo ""
echo -e "${YELLOW}⭐ If you like ClawHalla, please star us on GitHub!${NC}"
echo ""

# Save installation info
cat > "$INSTALL_DIR/.install-info.json" << EOF
{
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "0.2.0",
  "project_name": "$PROJECT_NAME",
  "model": "$CLAUDE_MODEL",
  "auth_method": "$AUTH_METHOD",
  "os": "$OS",
  "os_version": "$OS_VERSION"
}
EOF

exit 0
