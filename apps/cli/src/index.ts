import { Command } from 'commander';
import { connect } from './commands/connect.js';
import { disconnect } from './commands/disconnect.js';
import { status } from './commands/status.js';

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
