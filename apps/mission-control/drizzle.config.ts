import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || './data/mission-control.db'
  }
} satisfies Config;
