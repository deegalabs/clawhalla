import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { db } from './db';
import { secrets } from './schema';
import { eq } from 'drizzle-orm';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const passphrase = process.env.VAULT_KEY || process.env.GATEWAY_TOKEN || 'clawhalla-default-vault-key-change-me';
  return scryptSync(passphrase, 'clawhalla-vault-salt', 32);
}

function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted: encrypted + ':' + authTag,
    iv: iv.toString('hex'),
  };
}

function decrypt(encryptedValue: string, ivHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const [data, authTagHex] = encryptedValue.split(':');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface SecretEntry {
  id: string;
  name: string;
  description: string | null;
  category: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
  // Value is NEVER included in list responses
}

export interface SecretWithValue extends SecretEntry {
  value: string;
}

export const vault = {
  async ensureTable() {
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        encrypted_value TEXT NOT NULL,
        iv TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'api_key',
        created_by TEXT NOT NULL DEFAULT 'daniel',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER
      );
    `);
  },

  async list(): Promise<SecretEntry[]> {
    await this.ensureTable();
    const rows = await db.select({
      id: secrets.id,
      name: secrets.name,
      description: secrets.description,
      category: secrets.category,
      createdBy: secrets.createdBy,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
      lastAccessedAt: secrets.lastAccessedAt,
    }).from(secrets);
    return rows;
  },

  async get(name: string): Promise<SecretWithValue | null> {
    await this.ensureTable();
    const rows = await db.select().from(secrets).where(eq(secrets.name, name));
    if (rows.length === 0) return null;

    const row = rows[0];
    const value = decrypt(row.encryptedValue, row.iv);

    // Update last accessed
    await db.update(secrets)
      .set({ lastAccessedAt: new Date() })
      .where(eq(secrets.id, row.id));

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastAccessedAt: new Date(),
      value,
    };
  },

  async set(name: string, value: string, options?: { description?: string; category?: string }): Promise<SecretEntry> {
    await this.ensureTable();
    const { encrypted, iv } = encrypt(value);
    const now = new Date();
    const id = `sec_${Date.now().toString(36)}`;

    // Upsert
    const existing = await db.select({ id: secrets.id }).from(secrets).where(eq(secrets.name, name));

    if (existing.length > 0) {
      await db.update(secrets)
        .set({
          encryptedValue: encrypted,
          iv,
          description: options?.description,
          category: options?.category || 'api_key',
          updatedAt: now,
        })
        .where(eq(secrets.name, name));

      return {
        id: existing[0].id,
        name,
        description: options?.description || null,
        category: options?.category || 'api_key',
        createdBy: 'daniel',
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
      };
    }

    await db.insert(secrets).values({
      id,
      name,
      description: options?.description || null,
      encryptedValue: encrypted,
      iv,
      category: options?.category || 'api_key',
      createdBy: 'daniel',
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name,
      description: options?.description || null,
      category: options?.category || 'api_key',
      createdBy: 'daniel',
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: null,
    };
  },

  async delete(name: string): Promise<boolean> {
    await this.ensureTable();
    const result = await db.delete(secrets).where(eq(secrets.name, name));
    return (result as unknown as { changes: number }).changes > 0;
  },
};
