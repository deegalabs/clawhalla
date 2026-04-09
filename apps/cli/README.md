# @clawhalla/cli

> Tunnel your local Mission Control to a remote [OpenClaw](https://github.com/openclaw/openclaw) gateway.

The ClawHalla CLI opens a detached SSH tunnel from your laptop to a VPS running OpenClaw, so that Mission Control (running locally or in Docker on your machine) can talk to the remote gateway over `http://127.0.0.1:18789` without exposing it to the internet.

It is the workshop companion for [ClawHalla](https://github.com/deegalabs/clawhalla) — the self-hosted AI squad playground.

## Why you want this

- **Your VPS gateway never needs a public port.** SSH is the only ingress. Everything else stays loopback-only on the remote.
- **One command, zero manual key setup.** On the first run the CLI generates a dedicated ed25519 key at `~/.clawhalla/keys/id_ed25519` and installs it on the VPS with a single password prompt. Every run after that is passwordless.
- **Works with Mission Control in Docker on Linux.** The `--bind 0.0.0.0` flag exposes the tunnel through `host.docker.internal` so your MC container can reach it.
- **Multi-tunnel friendly.** Each tunnel gets a named alias, a unique local port pair, and a persisted entry under `~/.clawhalla/tunnels.json`. `status` and `disconnect` are alias-aware.

## Install

```bash
pnpm add -g @clawhalla/cli
# or
npm install -g @clawhalla/cli
```

Requires Node.js ≥ 20.

## Usage

### Open a tunnel

```bash
clawhalla connect root@vps.example.com
```

With everything wired up:

```bash
clawhalla connect root@vps.example.com:22022 \
  --alias staging \
  --remote-gateway-port 47716 \
  --no-bridge \
  --bind 0.0.0.0
```

The first run probes the VPS, detects that the ClawHalla key is not yet trusted, and falls into the install branch:

```
·  Probing SSH connectivity...
⚠  Remote doesn't trust our key yet — installing it on root@vps.example.com.
   You will be prompted for the remote password ONCE. After this, all
   future `clawhalla connect` calls are passwordless.

root@vps.example.com's password: ••••••••
✓  Key installed. Re-probing...
✓  SSH reachable.
·  Allocated local port   18789 (gateway only, --no-bridge) on 0.0.0.0
·  Spawning SSH tunnel (detached)...
✓  Tunnel up (pid 12345)
```

Subsequent runs skip straight to the tunnel spawn.

### List active tunnels

```bash
clawhalla status
```

### Close a tunnel

```bash
clawhalla disconnect staging
# or, to close everything:
clawhalla disconnect --all
```

## Flags reference

| Flag | Description |
|---|---|
| `-a, --alias <name>` | Local alias for this tunnel (default: first DNS label of host) |
| `-i, --identity <path>` | Use an existing SSH key instead of ClawHalla's managed one |
| `--remote-gateway-port <port>` | Remote OpenClaw gateway port (default: 18789) |
| `--remote-bridge-port <port>` | Remote OpenClaw WS bridge port (default: 18790) |
| `--no-bridge` | Skip the WS bridge forward. Use for bare-OpenClaw VPSs that only publish the HTTP gateway port. |
| `--skip-probe` | Skip the BatchMode SSH probe (useful for password-only auth) |
| `--no-auto-key` | Do not auto-generate or install a ClawHalla-managed SSH key |
| `--bind <host>` | Local interface to bind the forwarded ports on. Use `0.0.0.0` if Mission Control runs in a Docker container on Linux. Default: `127.0.0.1`. |

## Security notes

- `--bind 0.0.0.0` exposes the tunnel to every machine on your LAN. The CLI prints a loud warning when you pass this flag. Use it only on trusted networks (home wifi, personal hotspot), **never** on coworking, hotel, or conference wifi.
- The managed key lives at `~/.clawhalla/keys/id_ed25519` with mode `0600`. It has no passphrase — rotate it (or delete it and re-run `connect`) if your laptop is compromised.
- The CLI never writes your VPS password anywhere. The password prompt goes directly to `ssh(1)` via `stdio: 'inherit'`.

## How it works

`clawhalla connect` uses `spawn('ssh', ..., { detached: true })` + `unref()` (not `ssh -f`) so the parent keeps the child PID, which makes `disconnect` reliable. The tunnel itself is a standard `ssh -L` forward:

```
ssh -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o StrictHostKeyChecking=accept-new \
  -L <bind>:<local-gw-port>:127.0.0.1:<remote-gw-port> \
  -L <bind>:<local-br-port>:127.0.0.1:<remote-br-port> \
  <user>@<host>
```

State lives at `~/.clawhalla/tunnels.json`, with PID liveness pruning on every command. Ports are allocated starting at `18789/18790` and stepping by 10 for each additional tunnel.

## Project layout

This package is part of the [ClawHalla monorepo](https://github.com/deegalabs/clawhalla). The CLI source lives in `apps/cli/`. To develop locally:

```bash
git clone https://github.com/deegalabs/clawhalla.git
cd clawhalla/apps/cli
pnpm install
pnpm build
node dist/index.js --help
```

Or use the repo's install script which handles the whole monorepo setup:

```bash
git clone https://github.com/deegalabs/clawhalla.git ~/clawhalla
cd ~/clawhalla
./scripts/install-cli.sh
```

## License

MIT © ClawHalla Contributors. See [LICENSE](./LICENSE).
