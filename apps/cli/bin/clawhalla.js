#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('clawhalla: dist/ not built. Run `pnpm build` (or `npm run build`) inside apps/cli.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
