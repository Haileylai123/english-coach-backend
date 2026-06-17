// src/lib/rate-limit.ts — KV-based rate limiter
import { Env } from '../index';

export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const fullKey = `rl:${key}`;
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSec);
  const k = `${fullKey}:${window}`;
  const cur = parseInt((await env.KV.get(k)) || '0', 10);
  if (cur >= limit) return false;
  await env.KV.put(k, String(cur + 1), { expirationTtl: windowSec * 2 });
  return true;
}

/** Get current AI usage count for the day (from D1). */
export async function getAiUsageToday(env: Env, userId: string): Promise<{ used: number; limit: number }> {
  const today = new Date().toISOString().split('T')[0];
  const row = await env.DB.prepare(
    'SELECT call_count FROM ai_usage WHERE user_id = ? AND usage_date = ?',
  ).bind(userId, today).first<{ call_count: number }>();
  const used = row?.call_count || 0;
  // Read user tier to determine limit
  const user = await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(userId).first<{ tier: string }>();
  const tier = user?.tier || 'free';
  const limit = tier === 'premium' ? Infinity : tier === 'pro' ? parseInt(env.PRO_AI_QUOTA_PER_DAY, 10) : parseInt(env.FREE_AI_QUOTA_PER_DAY, 10);
  return { used, limit };
}

export async function incrementAiUsage(env: Env, userId: string, tokensUsed = 0): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ai_usage (id, user_id, usage_date, call_count, tokens_used, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET
      call_count = call_count + 1,
      tokens_used = tokens_used + ?,
      updated_at = ?
  `).bind(crypto.randomUUID(), userId, today, tokensUsed, now, tokensUsed, now).run();
}
