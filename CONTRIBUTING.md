# Contributing to ClawHalla

Thanks for your interest in contributing to ClawHalla!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/clawhalla.git`
3. Copy `.env.example` to `.env` and fill in your API keys
4. Run locally: `bash scripts/start.sh`

## Development Workflow

### Branch Naming

- `feat/` -- New features
- `fix/` -- Bug fixes
- `docs/` -- Documentation only
- `chore/` -- Maintenance tasks

### Commit Messages

We follow Conventional Commits in English.

Format: `<type>(<scope>): <description>`

Examples:

```text
feat(docker): add entrypoint for directory creation
fix(scripts): handle missing .env on start.sh
docs(readme): add remote deploy section
chore(deps): update openclaw to v1.2.0
```

### Pull Request Checklist

- [ ] All code and comments are in English
- [ ] No secrets or API keys committed
- [ ] Tested locally with `scripts/start.sh`
- [ ] Updated README if adding new features
- [ ] Follows existing code style

## Reporting Issues

Please include:

- Your OS and Docker version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (`docker compose logs clawhalla`)

## Questions?

Open a [Discussion](https://github.com/deegalabs/clawhalla/discussions) on GitHub.
