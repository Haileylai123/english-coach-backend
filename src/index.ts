// src/index.ts — Cloudflare Workers entry point
// English Coach backend API

import { router } from './router';
import { handleCors, jsonResponse, errorResponse } from './lib/response';
import { verifyToken } from './lib/jwt';
import { checkRateLimit } from './lib/rate-limit';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  AUDIO: R2Bucket;
  QUEUE: Queue;
  ENVIRONMENT: string;
  ALLOWED_ORIGIN: string;
  FREE_AI_QUOTA_PER_DAY: string;
  PRO_AI_QUOTA_PER_DAY: string;
  JWT_EXPIRY: string;
  REFRESH_EXPIRY: string;
  ANTHROPIC_API_KEY: string;
  JWT_SECRET: string;
  REFRESH_SECRET: string;
  ADMIN_EMAILS?: string;
  R2_SIGNING_KEY?: string;
  STRIPE_SECRET?: string;
  APPLE_SHARED_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return handleCors(request, env);

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const allowed = await checkRateLimit(env, `ip:${ip}`, 60, 60);
    if (!allowed) return errorResponse('Rate limit exceeded. Slow down.', 429);

    const url = new URL(request.url);
    const path = url.pathname;
    let userId: string | null = null;
    let isAdmin = false;

    if (path.startsWith('/api/') && !path.startsWith('/api/auth/') && path !== '/api/health' && path !== '/api/health/ready') {
      const auth = request.headers.get('Authorization');
      if (auth?.startsWith('Bearer ')) {
        const token = auth.slice(7);
        const payload = await verifyToken(token, env.JWT_SECRET);
        if (payload?.sub) {
          userId = payload.sub;
          if (payload.email) {
            const adminList = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
            isAdmin = adminList.includes(payload.email.toLowerCase());
          }
        } else {
          return errorResponse('Invalid or expired token', 401);
        }
      } else {
        return errorResponse('Authentication required', 401);
      }
    }

    try {
      return await router(request, env, ctx, userId, isAdmin);
    } catch (err: any) {
      console.error('[handler error]', err);
      return errorResponse(err?.message || 'Internal server error', 500);
    }
  },

  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const body = msg.body as { type: string; payload: any };
        await handleQueueMessage(body, env);
        msg.ack();
      } catch (e) {
        console.error('[queue error]', e);
        msg.retry();
      }
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    console.log('[cron]', cron, new Date().toISOString());
    try {
      if (cron === '0 0 * * *') await dailyReset(env);
      else if (cron === '0 12 * * *') await streakReminderFanout(env);
      else if (cron === '0 3 * * 0') await r2Cleanup(env);
    } catch (e) {
      console.error('[cron error]', cron, e);
    }
  },
};

async function dailyReset(env: Env): Promise<void> {
  const t = Date.now();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t - 30 * 86400_000).run();
  await env.DB.prepare('DELETE FROM ai_usage WHERE updated_at < ?').bind(t - 30 * 86400_000).run();
  console.log('[cron] daily reset done');
}

async function streakReminderFanout(env: Env): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
  const users = await env.DB.prepare(`
    SELECT u.id, u.locale FROM users u
    WHERE u.notify_enabled = 1
      AND u.streak > 0
      AND u.id NOT IN (SELECT user_id FROM practice_log WHERE practice_date = ?)
      AND u.id IN (SELECT user_id FROM practice_log WHERE practice_date = ?)
  `).bind(today, yesterday).all<{ id: string; locale: string }>();
  console.log(`[cron] streak reminders for ${users.results.length} users`);
  const { sendPushToUser } = await import('./lib/push-fanout');
  for (const u of users.results) {
    await sendPushToUser(env, u.id, {
      title: '🔥 今日學咗未?',
      body: u.locale?.startsWith('en')
        ? 'Keep your streak alive! 5 minutes is enough.'
        : u.locale?.startsWith('zh-CN')
        ? '保持连续打卡!5 分钟就够。'
        : '保持 streak 唔好斷!5 分鐘就夠。',
      data: { type: 'streak', userId: u.id },
    });
  }
}

async function r2Cleanup(env: Env): Promise<void> {
  const tierDays: Record<string, number> = { free: 7, pro: 90, premium: 365 };
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const list = await env.AUDIO.list({ cursor, limit: 1000 });
    for (const obj of list.objects) {
      const match = obj.key.match(/^audio\/([^/]+)\//);
      if (!match) continue;
      const userId = match[1];
      const user = await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(userId).first<{ tier: string }>();
      const tier = user?.tier || 'free';
      const ageMs = Date.now() - obj.uploaded.getTime();
      const maxAge = (tierDays[tier] || 7) * 86400_000;
      if (ageMs > maxAge) {
        await env.AUDIO.delete(obj.key);
        deleted++;
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  console.log(`[cron] r2 cleanup deleted ${deleted} old audio files`);
}

async function handleQueueMessage(body: { type: string; payload: any }, env: Env) {
  switch (body.type) {
    case 'analyze_deep':
      break;
    case 'notify_streak':
      const { sendPushToUser } = await import('./lib/push-fanout');
      await sendPushToUser(env, body.payload.userId, body.payload.notification);
      break;
    case 'cleanup_audio':
      await r2Cleanup(env);
      break;
    default:
      console.warn('[queue] unknown type', body.type);
  }
}

export const healthRoute = async (request: Request, env: Env): Promise<Response> => {
  return jsonResponse({ status: 'ok', env: env.ENVIRONMENT, time: new Date().toISOString() });
};

export const healthReadyRoute = async (request: Request, env: Env): Promise<Response> => {
  const checks: Record<string, string> = {};
  try {
    await env.DB.prepare('SELECT 1 AS x').first();
    checks.database = 'ok';
  } catch (e: any) { checks.database = `error: ${e.message}`; }
  try {
    await env.KV.get('health-check');
    checks.kv = 'ok';
  } catch (e: any) { checks.kv = `error: ${e.message}`; }
  try {
    await env.AUDIO.head('health-check-probe');
    checks.r2 = 'ok';
  } catch (e: any) { checks.r2 = e.message?.includes('NotFound') ? 'ok' : `error: ${e.message}`; }
  const allOk = Object.values(checks).every(v => v === 'ok');
  return jsonResponse({ status: allOk ? 'ok' : 'degraded', checks }, allOk ? 200 : 503);
};
