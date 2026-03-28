import nodemailer from 'nodemailer';
import { db } from './db';
import { campaigns, campaignContacts } from './schema';
import { eq, and } from 'drizzle-orm';
import { vault } from './vault';

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
  delayMinDay: number;   // ms between emails during day (default 120000 = 2min)
  delayMaxDay: number;   // ms (default 300000 = 5min)
  delayMinNight: number; // ms during night (default 480000 = 8min)
  delayMaxNight: number; // ms (default 720000 = 12min)
  pauseWindows: string;  // comma-separated: "23:00-08:00,12:00-13:30"
  breakEvery: number;    // pause after N emails (default 15)
  breakMinMs: number;    // min break duration (default 900000 = 15min)
  breakMaxMs: number;    // max break duration (default 2700000 = 45min)
  timezone: string;      // default "America/Sao_Paulo"
  maxConsecutiveFails: number; // stop after N consecutive fails (default 5)
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
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

function parseTime(str: string): number {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function inWindow(windowStr: string, tz: string): boolean {
  const [startStr, endStr] = windowStr.split('-');
  const now = nowInTZ(tz);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseTime(startStr);
  const e = parseTime(endStr);
  return s > e ? (cur >= s || cur < e) : (cur >= s && cur < e);
}

function pauseWindowWait(windows: string[], tz: string): number {
  const now = nowInTZ(tz);
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const w of windows) {
    if (!inWindow(w, tz)) continue;
    const [, endStr] = w.split('-');
    const e = parseTime(endStr);
    const minsLeft = e > cur ? (e - cur) : (24 * 60 - cur + e);
    return minsLeft * 60 * 1000;
  }
  return 0;
}

function getPeriod(tz: string): 'day' | 'night' {
  const h = nowInTZ(tz).getHours();
  return (h >= 8 && h < 22) ? 'day' : 'night';
}

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// ---------------------------------------------------------------------------
// Get SMTP config from vault
// ---------------------------------------------------------------------------

async function getSmtpConfig(vaultKey: string): Promise<SmtpConfig> {
  const secret = await vault.get(vaultKey);
  if (!secret) {
    throw new Error(`SMTP credentials not found in vault (key: ${vaultKey}). Store a JSON object with host, port, user, pass.`);
  }
  try {
    const config = JSON.parse(secret.value);
    if (!config.host || !config.port || !config.user || !config.pass) {
      throw new Error('SMTP config must include host, port, user, pass');
    }
    return config;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`SMTP vault secret "${vaultKey}" is not valid JSON. Expected: {"host":"...","port":587,"user":"...","pass":"..."}`);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Main send loop
// ---------------------------------------------------------------------------

export async function startCampaignSend(campaignId: string): Promise<{ started: boolean; error?: string }> {
  if (activeSenders.has(campaignId)) {
    return { started: false, error: 'Campaign is already sending' };
  }

  // Load campaign
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return { started: false, error: 'Campaign not found' };
  if (campaign.status === 'completed') return { started: false, error: 'Campaign already completed' };

  // Parse settings
  const settings: SendSettings = { ...DEFAULT_SETTINGS, ...(campaign.settings ? JSON.parse(campaign.settings) : {}) };
  const pauseWindows = settings.pauseWindows.split(',').map(w => w.trim()).filter(Boolean);

  // Get SMTP from vault
  let smtpConfig: SmtpConfig;
  try {
    smtpConfig = await getSmtpConfig(campaign.smtpVaultKey);
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Failed to get SMTP config';
    await db.update(campaigns).set({ status: 'failed', error, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    return { started: false, error };
  }

  // Load pending contacts
  const pendingContacts = await db.select().from(campaignContacts)
    .where(and(eq(campaignContacts.campaignId, campaignId), eq(campaignContacts.status, 'pending')));

  if (pendingContacts.length === 0) {
    await db.update(campaigns).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    return { started: false, error: 'No pending contacts' };
  }

  // Set up abort controller
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
          ...(contact.variables ? JSON.parse(contact.variables) : {}),
        };

        const html = interpolateTemplate(campaign.templateHtml, vars);
        const text = campaign.templateText ? interpolateTemplate(campaign.templateText, vars) : undefined;
        const subject = interpolateTemplate(campaign.subject, vars);

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

          // Update campaign counters
          await db.update(campaigns)
            .set({ sentCount: successCount, updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));

          console.log(`[campaign:${campaignId}] Sent ${successCount}/${pendingContacts.length + campaign.sentCount}: ${contact.email}`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Send failed';
          failCount++;
          consecutiveFails++;

          await db.update(campaignContacts)
            .set({ status: 'failed', error: errMsg })
            .where(eq(campaignContacts.id, contact.id));

          await db.update(campaigns)
            .set({ failedCount: failCount, updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));

          console.error(`[campaign:${campaignId}] Failed: ${contact.email} — ${errMsg}`);

          if (consecutiveFails >= settings.maxConsecutiveFails) {
            const fatalMsg = `${settings.maxConsecutiveFails} consecutive failures — stopping. Check SMTP.`;
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
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
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
    }
  })();

  return { started: true };
}
