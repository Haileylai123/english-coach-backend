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
  AI: Ai;
  JWT_SECRET: string;
  REFRESH_SECRET: string;
  MINIMAX_API_KEY: string;
  ADMIN_EMAILS?: string;
  R2_SIGNING_KEY?: string;
  STRIPE_SECRET?: string;
  APPLE_SHARED_SECRET?: string;
  DAILY_CHALLENGE_PUSH_HOUR?: string;
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

    if (path.startsWith('/api/') && !path.startsWith('/api/auth/') && path !== '/api/health' && path !== '/api/health/ready' && !path.startsWith('/api/daily-challenge/today')) {
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
      else if (cron === '0 1 * * *') await dailyChallengePush(env);
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

/** Push the daily challenge at 9 AM Asia time (1 UTC) to all opted-in users. */
async function dailyChallengePush(env: Env): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  // Find scene for today (mirrors pickDailyPrompt in daily-challenge.ts)
  const d = new Date(today + 'T00:00:00Z');
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86400_000);
  const scenes = ['daily', 'business', 'ielts', 'interview', 'dating', 'keigo', 'izakaya', 'toeic', 'job-hunt-kr'];
  const scene = scenes[dayOfYear % scenes.length];
  // Skip if user already did today's challenge
  const users = await env.DB.prepare(`
    SELECT u.id, u.locale FROM users u
    WHERE u.notify_enabled = 1
      AND u.id NOT IN (SELECT user_id FROM daily_challenge_completions WHERE challenge_date = ?)
  `).bind(today).all<{ id: string; locale: string }>();
  console.log(`[cron] daily challenge push for ${users.results.length} users (${scene})`);
  const { sendPushToUser } = await import('./lib/push-fanout');
  for (const u of users.results) {
    const title = u.locale?.startsWith('ja') ? '🎯 今日のチャレンジ'
      : u.locale?.startsWith('ko') ? '🎯 오늘의 챌린지'
      : u.locale?.startsWith('en') ? '🎯 Daily Challenge'
      : u.locale?.startsWith('zh-CN') ? '🎯 每日挑战'
      : '🎯 今日挑戰';
    const body = u.locale?.startsWith('ja') ? '30秒で高スコアを狙え!'
      : u.locale?.startsWith('ko') ? '30초 안에 고득점 도전!'
      : u.locale?.startsWith('en') ? 'Beat yesterday\'s score in 30 seconds!'
      : u.locale?.startsWith('zh-CN') ? '30 秒挑战高分!'
      : '30 秒鬥高分!';
    await sendPushToUser(env, u.id, {
      title,
      body,
      data: { type: 'daily_challenge', scene, date: today },
    });
  }
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
    case 'daily_challenge_fanout':
      await dailyChallengePush(env);
      break;
    default:
      console.warn('[queue] unknown type', body.type);
  }
}

