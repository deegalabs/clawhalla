// Minimal ANSI logger. No deps — keeps CLI startup fast.

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
} as const;

export const log = {
  info: (msg: string) => console.log(`${C.blue}·${C.reset}  ${msg}`),
  ok: (msg: string) => console.log(`${C.green}✓${C.reset}  ${msg}`),
  warn: (msg: string) => console.warn(`${C.yellow}⚠${C.reset}  ${msg}`),
  err: (msg: string) => console.error(`${C.red}✗${C.reset}  ${msg}`),
  dim: (msg: string) => console.log(`${C.dim}${msg}${C.reset}`),
  title: (msg: string) => console.log(`\n${C.bold}${msg}${C.reset}\n`),
  kv: (key: string, value: string) =>
    console.log(`  ${C.dim}${key}${C.reset}  ${value}`),
};

export const colors = C;
