// Simple in-memory rate limiter for process-spawning endpoints.
// Limits concurrent executions and per-minute request count.

interface RateLimitState {
  active: number;
  timestamps: number[];
}

const limits = new Map<string, RateLimitState>();

export interface RateLimitConfig {
  maxConcurrent: number;  // max simultaneous executions
  maxPerMinute: number;   // max requests per 60s window
}

const DEFAULT_CONFIG: RateLimitConfig = { maxConcurrent: 3, maxPerMinute: 10 };

/**
 * Check if a request is allowed. Returns null if OK, or an error message if blocked.
 * Call `releaseRateLimit(key)` when the operation completes.
 */
export function checkRateLimit(key: string, config: RateLimitConfig = DEFAULT_CONFIG): string | null {
  let state = limits.get(key);
  if (!state) {
    state = { active: 0, timestamps: [] };
    limits.set(key, state);
  }

  // Check concurrent limit
  if (state.active >= config.maxConcurrent) {
    return `Too many concurrent requests (max ${config.maxConcurrent}). Try again shortly.`;
  }

  // Check per-minute limit
  const now = Date.now();
  state.timestamps = state.timestamps.filter(t => now - t < 60_000);
  if (state.timestamps.length >= config.maxPerMinute) {
    return `Rate limit exceeded (max ${config.maxPerMinute}/min). Wait before retrying.`;
  }

  // Allow
  state.active++;
  state.timestamps.push(now);
  return null;
}

/** Release one concurrent slot after operation completes */
export function releaseRateLimit(key: string) {
  const state = limits.get(key);
  if (state && state.active > 0) {
    state.active--;
  }
}
