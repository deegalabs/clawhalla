# ClawHalla Roadmap

## Version history

### v0.1.0 - Local Docker MVP (current)

Goal: zero-friction local setup

- [x] Pre-configured Dockerfile
- [x] Docker Compose orchestration
- [x] Entrypoint for directory initialization
- [x] Scripts: start.sh, stop.sh, reset.sh
- [x] Documentation suite
- [x] MIT License

## Planned versions

### v0.2.0 - Automated onboarding

Goal: skip the wizard for power users

- [ ] `.env` driven agent configuration
- [ ] Non-interactive onboarding
- [ ] Pre-configured agent templates
- [ ] Healthcheck improvements

### v0.3.0 - Remote deployment

Goal: one command to deploy on a VPS

- [ ] `scripts/deploy-remote.sh` via SSH
- [ ] Automatic Docker install on target
- [ ] Secure key handling
- [ ] Basic monitoring setup

### v0.4.0 - Distribution & polish

Goal: easier distribution

- [ ] Node CLI wrapper (`clawhalla init`, `clawhalla deploy`)
- [ ] npm package publication
- [ ] Landing page
- [ ] Usage analytics (opt-in)

### v1.0.0 - Cloud connector

Goal: managed deployment option

- [ ] Web dashboard for agent management
- [ ] Cloud connector service
- [ ] Multi-agent orchestration
- [ ] Collaboration features
