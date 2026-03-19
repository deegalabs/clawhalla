# ClawHalla -- Pre-configured Ubuntu 24.04 for OpenClaw
# User: clawdbot | Node 24 (nvm) | pnpm | Homebrew | OpenClaw CLI
# Onboard runs manually after container starts.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System update
RUN apt-get update && apt-get upgrade -y

# Base packages
RUN apt-get install -y \
    git \
    curl \
    build-essential \
    adduser \
    sudo \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create clawdbot user (password: clawdbot@2026)
RUN adduser --gecos '' --disabled-password clawdbot \
    && echo 'clawdbot:clawdbot@2026' | chpasswd

# Sudo access for clawdbot (NOPASSWD for non-interactive scripts)
RUN echo 'clawdbot ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/clawdbot \
    && chmod 440 /etc/sudoers.d/clawdbot

# Switch to clawdbot user
USER clawdbot
WORKDIR /home/clawdbot

# Install nvm + Node 24 + pnpm
RUN bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash' \
    && bash -c '. ~/.nvm/nvm.sh && nvm install 24 && corepack enable pnpm'

# pnpm global bin directory (required for "pnpm add -g")
ENV PNPM_HOME="/home/clawdbot/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

# Install Homebrew (Linux, non-interactive)
ENV PATH="/home/clawdbot/.linuxbrew/bin:/home/clawdbot/.linuxbrew/sbin:${PATH}"
RUN bash -c 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' \
    && echo 'eval "$(/home/clawdbot/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc

# Install OpenClaw CLI globally via pnpm
# Note: Onboard wizard runs manually after container starts
RUN bash -c '. ~/.nvm/nvm.sh && pnpm add -g openclaw'

# Load nvm + brew on bash login
ENV BASH_ENV=~/.bashrc

# Copy entrypoint script
USER root
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER clawdbot

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
