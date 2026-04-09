import { join } from 'path';
import { homedir } from 'os';

const HOME = process.env.HOME || homedir();

/** Root OpenClaw directory (~/.openclaw) */
export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(HOME, '.openclaw');

/** Main OpenClaw config file */
export const OPENCLAW_CONFIG = join(OPENCLAW_HOME, 'openclaw.json');

/** Agent workspace root */
export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(OPENCLAW_HOME, 'workspace');

/** Gateway agent directories (auth-profiles, models) */
export const AGENTS_DIR = join(OPENCLAW_HOME, 'agents');

/** Cron jobs file */
export const CRON_JOBS = join(OPENCLAW_HOME, 'cron', 'jobs.json');

/** ClawHalla CLI state directory (~/.clawhalla) — managed by `clawhalla connect`. */
export const CLAWHALLA_HOME = process.env.CLAWHALLA_HOME || join(HOME, '.clawhalla');

/** Active SSH tunnels registry written by `clawhalla connect`. */
export const CLAWHALLA_TUNNELS = join(CLAWHALLA_HOME, 'tunnels.json');
