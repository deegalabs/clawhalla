import { db } from './db';
import { settings } from './schema';
import { eq } from 'drizzle-orm';

export function getSetting(key: string, fallback = ''): string {
  try {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run();
}
