import { Command } from 'commander';
import { connect } from './commands/connect.js';
import { disconnect } from './commands/disconnect.js';
import { status } from './commands/status.js';
import {
  mcInstall,
  mcStart,
  mcStop,
  mcStatus,
  mcLogs,
  mcOpen,
} from './commands/mc.js';

const program = new Command();

program
  .name('clawhalla')
  .description(
    'ClawHalla CLI — tunnel your local Mission Control to a remote OpenClaw gateway.',
  )
  .version('0.1.0');

program
  .command('connect')
  .description('Open an SSH tunnel to a remote VPS running OpenClaw.')
  .argument('<target>', 'SSH target: user@host, user@host:port, or ~/.ssh/config alias')
  .option('-a, --alias <name>', 'Local alias for this tunnel (default: first DNS label of host)')
  .option('-i, --identity <path>', 'SSH identity file (private key)')
  .option('--remote-gateway-port <port>', 'Remote OpenClaw gateway port', (v) => Number.parseInt(v, 10), 18789)
  .option('--remote-bridge-port <port>', 'Remote OpenClaw bridge port', (v) => Number.parseInt(v, 10), 18790)
  .option('--skip-probe', 'Skip the BatchMode SSH probe (useful for password auth)')
  .option('--no-auto-key', 'Do not auto-generate or install a ClawHalla-managed SSH key')
  .option(
    '--no-bridge',
    'Skip the WS bridge forward. Use for bare-OpenClaw VPSs that only publish the HTTP gateway port (e.g. the ipe.city workshop boxes).',
  )
  .option(
    '--bind <host>',
    'Local interface to bind the forwarded ports on. Use 0.0.0.0 if Mission Control runs in a Docker container on Linux (default: 127.0.0.1)',
    '127.0.0.1',
  )
  .action(async (target: string, opts) => {
    const code = await connect(target, {
      alias: opts.alias,
      identity: opts.identity,
      remoteGatewayPort: opts.remoteGatewayPort,
      remoteBridgePort: opts.remoteBridgePort,
      skipProbe: opts.skipProbe,
      bindHost: opts.bind,
      noAutoKey: opts.autoKey === false,
      noBridge: opts.bridge === false,
    });
    process.exit(code);
  });

program
  .command('disconnect')
  .description('Close an active SSH tunnel.')
  .argument('[alias]', 'Alias to disconnect (omit if using --all)')
  .option('--all', 'Disconnect all active tunnels')
  .action(async (alias: string | undefined, opts) => {
    const code = await disconnect(alias, { all: opts.all });
    process.exit(code);
  });

program
  .command('status')
  .description('List active SSH tunnels and their local ports.')
  .action(async () => {
    const code = await status();
    process.exit(code);
  });

/* ------------------------------- mc * -------------------------------- */

const mc = program
  .command('mc')
  .description('Install and run Mission Control locally (install / start / stop / status / logs / open).');

mc.command('install')
  .description('Clone the clawhalla repo and install Mission Control dependencies.')
  .action(async () => {
    const code = await mcInstall();
    process.exit(code);
  });

mc.command('start')
  .description('Start Mission Control in the background (detached pnpm dev).')
  .option('-p, --port <port>', 'Port to bind Mission Control on', (v) => Number.parseInt(v, 10), 3000)
  .action(async (opts) => {
    const code = await mcStart({ port: opts.port });
    process.exit(code);
  });

mc.command('stop')
  .description('Stop the Mission Control dev server.')
  .action(async () => {
    const code = await mcStop();
    process.exit(code);
  });

mc.command('status')
  .description('Show Mission Control process + HTTP status.')
  .option('-p, --port <port>', 'Port Mission Control is bound to', (v) => Number.parseInt(v, 10), 3000)
  .action(async (opts) => {
    const code = await mcStatus({ port: opts.port });
    process.exit(code);
  });

mc.command('logs')
  .description('Tail the Mission Control log file.')
  .option('-f, --follow', 'Follow the log output (tail -f)', false)
  .action(async (opts) => {
    const code = await mcLogs(!!opts.follow);
    process.exit(code);
  });

mc.command('open')
  .description('Open Mission Control in your default browser.')
  .option('-p, --port <port>', 'Port Mission Control is bound to', (v) => Number.parseInt(v, 10), 3000)
  .action(async (opts) => {
    const code = await mcOpen({ port: opts.port });
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
