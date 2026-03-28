import nodemailer from 'nodemailer';
import { db } from './db';
import { campaigns, campaignContacts } from './schema';
import { eq, and } from 'drizzle-orm';
import { vault } from './vault';
import { releaseRateLimit } from './rate-limit';

// ---------------------------------------------------------------------------
// Anti-spam campaign sender — adapted from ipe-campaign
// Human-like delays, pause windows, breaks every N emails, crash-safe
// ---------------------------------------------------------------------------

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

interface SendSettings {
  delayMinDay: number;
  delayMaxDay: number;
  delayMinNight: number;
  delayMaxNight: number;
  pauseWindows: string;
  breakEvery: number;
  breakMinMs: number;
  breakMaxMs: number;
  timezone: string;
  maxConsecutiveFails: number;
}

const DEFAULT_SETTINGS: SendSettings = {
  delayMinDay: 120_000,
  delayMaxDay: 300_000,
  delayMinNight: 480_000,
  delayMaxNight: 720_000,
  pauseWindows: '23:00-08:00',
  breakEvery: 15,
  breakMinMs: 900_000,
  breakMaxMs: 2_700_000,
  timezone: 'America/Sao_Paulo',
  maxConsecutiveFails: 5,
};

// Active senders — one per campaign at most
const activeSenders = new Map<string, { abort: () => void }>();

export function isRunning(campaignId: string): boolean {
  return activeSenders.has(campaignId);
}

export function abortCampaign(campaignId: string): boolean {
  const sender = activeSenders.get(campaignId);
  if (sender) {
    sender.abort();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
  });
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nowInTZ(tz: string): Date {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  } catch {
    // Invalid timezone — fallback to UTC
    return new Date();
  }
}

function parseTime(str: string): number {
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inWindow(windowStr: string, tz: string): boolean {
  const parts = windowStr.split('-');
  if (parts.length !== 2) return false;
  const now = nowInTZ(tz);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseTime(parts[0]);
  const e = parseTime(parts[1]);
  return s > e ? (cur >= s || cur < e) : (cur >= s && cur < e);
}

function pauseWindowWait(windows: string[], tz: string): number {
  const now = nowInTZ(tz);
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const w of windows) {
    if (!inWindow(w, tz)) continue;
    const parts = w.split('-');
    if (parts.length !== 2) continue;
    const e = parseTime(parts[1]);
    const minsLeft = e > cur ? (e - cur) : (24 * 60 - cur + e);
    return minsLeft * 60 * 1000;
  }
  return 0;
}

function getPeriod(tz: string): 'day' | 'night' {
  const h = nowInTZ(tz).getHours();
  return (h >= 8 && h < 22) ? 'day' : 'night';
}

// HTML-escape values before interpolating into HTML templates
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function interpolateHtml(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] || ''));
}

function interpolateText(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// Mask email for logging: d***@example.com
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

// Sanitize error messages to avoid leaking SMTP internals
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Send failed';
  // Remove server banners and IPs
  return msg.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[redacted]')
    .replace(/\b(?:EHLO|HELO|AUTH|MAIL FROM|RCPT TO)\b.*$/gm, '[redacted]')
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// Get SMTP config from vault
// ---------------------------------------------------------------------------

async function getSmtpConfig(vaultKey: string): Promise<SmtpConfig> {
  const secret = await vault.get(vaultKey);
  if (!secret) {
    throw new Error('SMTP credentials not configured. Add them in Settings > Vault.');
  }
  try {
    const config = JSON.parse(secret.value);
    if (!config.host || !config.port || !config.user || !config.pass) {
      throw new Error('SMTP config must include host, port, user, pass');
    }
    return { host: String(config.host), port: Number(config.port), user: String(config.user), pass: String(config.pass) };
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('SMTP vault secret is not valid JSON. Expected: {"host":"...","port":587,"user":"...","pass":"..."}');
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Parse and clamp settings
// ---------------------------------------------------------------------------

function parseSettings(raw: string | null): SendSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw) return settings;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return settings;
    // Merge only known keys
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SendSettings)[]) {
      if (parsed[key] !== undefined) (settings as Record<string, unknown>)[key] = parsed[key];
    }
  } catch {
    return settings;
  }
  // Clamp values to prevent anti-spam bypass
  settings.delayMinDay = Math.max(30_000, settings.delayMinDay);
  settings.delayMaxDay = Math.max(settings.delayMinDay, settings.delayMaxDay);
  settings.delayMinNight = Math.max(60_000, settings.delayMinNight);
  settings.delayMaxNight = Math.max(settings.delayMinNight, settings.delayMaxNight);
  settings.breakEvery = Math.max(1, Math.min(100, settings.breakEvery));
  settings.breakMinMs = Math.max(60_000, settings.breakMinMs);
  settings.breakMaxMs = Math.max(settings.breakMinMs, settings.breakMaxMs);
  settings.maxConsecutiveFails = Math.max(1, Math.min(50, settings.maxConsecutiveFails));
  return settings;
}

// ---------------------------------------------------------------------------
// Parse contact variables safely (prevent prototype pollution)
// ---------------------------------------------------------------------------

function parseVariables(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (typeof v === 'string') clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main send loop
// ---------------------------------------------------------------------------

export async function startCampaignSend(campaignId: string): Promise<{ started: boolean; error?: string }> {
  // Race condition fix: set placeholder immediately to prevent double-start
  if (activeSenders.has(campaignId)) {
    return { started: false, error: 'Campaign is already sending' };
  }
  activeSenders.set(campaignId, { abort: () => {} }); // placeholder

  try {
    // Load campaign
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) { activeSenders.delete(campaignId); return { started: false, error: 'Campaign not found' }; }
    if (campaign.status === 'completed') { activeSenders.delete(campaignId); return { started: false, error: 'Campaign already completed' }; }

    // Parse and clamp settings
    const settings = parseSettings(campaign.settings);
    const pauseWindows = settings.pauseWindows.split(',').map(w => w.trim()).filter(Boolean);

    // Get SMTP from vault
    let smtpConfig: SmtpConfig;
    try {
      smtpConfig = await getSmtpConfig(campaign.smtpVaultKey);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to get SMTP config';
      await db.update(campaigns).set({ status: 'failed', error, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
      activeSenders.delete(campaignId);
      return { started: false, error };
    }

    // Load pending contacts
    const pendingContacts = await db.select().from(campaignContacts)
      .where(and(eq(campaignContacts.campaignId, campaignId), eq(campaignContacts.status, 'pending')));

    if (pendingContacts.length === 0) {
      await db.update(campaigns).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
      activeSenders.delete(campaignId);
      return { started: false, error: 'No pending contacts' };
    }

    // Set up real abort controller
    const ac = new AbortController();
    activeSenders.set(campaignId, { abort: () => ac.abort() });

    // Mark campaign as sending
    await db.update(campaigns).set({ status: 'sending', startedAt: campaign.startedAt || new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

    // Fire-and-forget background loop
    (async () => {
      const transport = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.port === 465,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
        pool: true,
        maxConnections: 1,
        rateDelta: 2000,
        rateLimit: 3,
      });

      let successCount = campaign.sentCount;
      let failCount = campaign.failedCount;
      let consecutiveFails = 0;

      try {
        for (let i = 0; i < pendingContacts.length; i++) {
          if (ac.signal.aborted) break;

          // Check pause windows
          const wait = pauseWindowWait(pauseWindows, settings.timezone);
          if (wait > 0) {
            console.log(`[campaign:${campaignId}] Pause window active, sleeping ${Math.round(wait / 60000)}min`);
            await sleep(wait, ac.signal);
          }

          const contact = pendingContacts[i];
          const vars: Record<string, string> = {
            name: contact.name || '',
            email: contact.email,
            ...parseVariables(contact.variables),
          };

          // HTML template: escape variables to prevent XSS in email clients
          const html = interpolateHtml(campaign.templateHtml, vars);
          // Plain text: no escaping needed
          const text = campaign.templateText ? interpolateText(campaign.templateText, vars) : undefined;
          const subject = interpolateText(campaign.subject, vars);

          try {
            await transport.sendMail({
              from: `"${campaign.fromName}" <${campaign.fromEmail}>`,
              to: contact.email,
              replyTo: campaign.replyTo || undefined,
              subject,
              html,
              text,
              headers: {
                'List-Unsubscribe': `<mailto:${campaign.replyTo || campaign.fromEmail}?subject=Unsubscribe>`,
              },
            });

            await db.update(campaignContacts)
              .set({ status: 'sent', sentAt: new Date() })
              .where(eq(campaignContacts.id, contact.id));

            successCount++;
            consecutiveFails = 0;

            await db.update(campaigns)
              .set({ sentCount: successCount, updatedAt: new Date() })
              .where(eq(campaigns.id, campaignId));

            console.log(`[campaign:${campaignId}] Sent ${successCount}/${pendingContacts.length + campaign.sentCount}: ${maskEmail(contact.email)}`);
          } catch (err) {
            const errMsg = sanitizeError(err);
            failCount++;
            consecutiveFails++;

            await db.update(campaignContacts)
              .set({ status: 'failed', error: errMsg })
              .where(eq(campaignContacts.id, contact.id));

            await db.update(campaigns)
              .set({ failedCount: failCount, updatedAt: new Date() })
              .where(eq(campaigns.id, campaignId));

            console.error(`[campaign:${campaignId}] Failed: ${maskEmail(contact.email)} — ${errMsg}`);

            if (consecutiveFails >= settings.maxConsecutiveFails) {
              const fatalMsg = `${settings.maxConsecutiveFails} consecutive failures — stopping. Check SMTP configuration.`;
              await db.update(campaigns)
                .set({ status: 'failed', error: fatalMsg, updatedAt: new Date() })
                .where(eq(campaigns.id, campaignId));
              break;
            }
          }

          // Skip delay for last email
          if (i >= pendingContacts.length - 1) break;

          // Human break every N emails
          if ((i + 1) % settings.breakEvery === 0) {
            const breakMs = randomBetween(settings.breakMinMs, settings.breakMaxMs);
            console.log(`[campaign:${campaignId}] Human break after ${settings.breakEvery} emails — ${Math.round(breakMs / 60000)}min`);
            await sleep(breakMs, ac.signal);
            continue;
          }

          // Normal delay between emails
          const period = getPeriod(settings.timezone);
          const min = period === 'day' ? settings.delayMinDay : settings.delayMinNight;
          const max = period === 'day' ? settings.delayMaxDay : settings.delayMaxNight;
          const delay = randomBetween(min, max);
          await sleep(delay, ac.signal);
        }

        // Check final status
        if (!ac.signal.aborted) {
          const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
          if (updated && updated.status === 'sending') {
            await db.update(campaigns)
              .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
              .where(eq(campaigns.id, campaignId));
          }
        } else {
          await db.update(campaigns)
            .set({ status: 'paused', updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));
        }
      } catch (e) {
        if ((e as Error).message !== 'aborted') {
          const errMsg = sanitizeError(e);
          await db.update(campaigns)
            .set({ status: 'failed', error: errMsg, updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));
          console.error(`[campaign:${campaignId}] Fatal error:`, errMsg);
        } else {
          await db.update(campaigns)
            .set({ status: 'paused', updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));
        }
      } finally {
        transport.close();
        activeSenders.delete(campaignId);
        releaseRateLimit('campaign-send');
      }
    })();

    return { started: true };
  } catch (e) {
    // Cleanup on any unexpected error during setup
    activeSenders.delete(campaignId);
    throw e;
  }
}
