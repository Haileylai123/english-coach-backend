// src/lib/push-fanout.ts — Expo Push API wrapper + DB-backed token storage
// https://docs.expo.dev/push-notifications/sending-notifications/

import { Env } from '../index';
import { uuid, now } from './helpers';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
}

/** Send push to all enabled devices for a user. */
export async function sendPushToUser(env: Env, userId: string, payload: PushPayload): Promise<{ sent: number; errors: number }> {
  const tokens = await env.DB.prepare(
    'SELECT token, platform FROM notification_tokens WHERE user_id = ? AND enabled = 1'
  ).bind(userId).all<{ token: string; platform: string }>();
  if (tokens.results.length === 0) return { sent: 0, errors: 0 };

  const messages = tokens.results.map(t => ({
    to: t.token,
    sound: payload.sound || 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    badge: payload.badge,
  }));

  // Expo Push API accepts batches of 100
  let sent = 0, errors = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        errors += batch.length;
        continue;
      }
      const result: any = await res.json();
      const data = result.data || [];
      data.forEach((r: any, idx: number) => {
        if (r.status === 'ok') sent++;
        else {
          errors++;
          // Auto-cleanup invalid tokens
          if (r.details?.error === 'DeviceNotRegistered' || r.details?.error === 'InvalidCredentials') {
            env.DB.prepare('DELETE FROM notification_tokens WHERE token = ?')
              .bind(batch[idx].to).run()
              .catch(() => {});
          }
        }
      });
    } catch (e) {
      errors += batch.length;
    }
  }
  return { sent, errors };
}

/** Send push to many users at once (e.g. broadcast). */
export async function sendPushToUsers(env: Env, userIds: string[], payload: PushPayload): Promise<{ sent: number; errors: number }> {
  let sent = 0, errors = 0;
  for (const uid of userIds) {
    const r = await sendPushToUser(env, uid, payload);
    sent += r.sent;
    errors += r.errors;
  }
  return { sent, errors };
}

/** Save a device push token for a user. */
export async function registerToken(env: Env, userId: string, token: string, platform?: string): Promise<{ ok: boolean }> {
  const t = now();
  await env.DB.prepare(`
    INSERT INTO notification_tokens (id, user_id, token, platform, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform, updated_at = ?
  `).bind(uuid(), userId, token, platform || null, t, t, t).run();
  return { ok: true };
}

export async function unregisterToken(env: Env, userId: string, token: string): Promise<{ ok: boolean }> {
  await env.DB.prepare('DELETE FROM notification_tokens WHERE user_id = ? AND token = ?').bind(userId, token).run();
  return { ok: true };
}
