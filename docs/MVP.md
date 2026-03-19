# ClawHalla MVP Definition

## Problem

OpenClaw setup requires:

- Node.js 24 installation
- pnpm configuration
- Multiple CLI commands
- Understanding of the OpenClaw ecosystem

This creates friction for developers who just want to test or run an agent quickly.

## Solution

ClawHalla wraps OpenClaw in a pre-configured Docker container with helper scripts, reducing setup time from tens of minutes to a few minutes.

## MVP scope (v0.1.0)

In scope:

- [x] Pre-configured Dockerfile (Ubuntu 24.04, Node 24, pnpm)
- [x] OpenClaw CLI installed
- [x] Docker Compose orchestration
- [x] Persistent volume for agent data
- [x] Helper scripts: start, stop, reset
- [x] Documentation suite
- [x] MIT license

Out of scope (future versions):

- [ ] Remote deploy via SSH
- [ ] Non-interactive onboarding automation as a first-class feature
- [ ] CLI binary distribution
- [ ] Web panel
- [ ] Cloud connector

## Success criteria

A user with Docker installed can:

1. Clone the repo
2. Copy `.env.example` to `.env` and add provider key(s)
3. Run `bash scripts/start.sh`
4. Enter the container
5. Run `openclaw onboard`
6. Have a working setup quickly

## Target users

- Developers evaluating OpenClaw
- Teams wanting isolated agent environments
- Users who prefer Docker over local Node installs
