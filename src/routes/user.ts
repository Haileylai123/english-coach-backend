// src/routes/user.ts — user profile, settings, logout
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { verifyToken } from '../lib/jwt';
import { now } from '../lib/helpers';

export async function userRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/user/me' && method === 'GET') return await getMe(userId, env);
  if (path === '/api/user/me' && method === 'PATCH') return await updateMe(request, userId, env);
  if (path === '/api/auth/logout' && method === 'POST') return await logout(request, userId, env);

  return errorResponse('Not found', 404);
}

async function getMe(userId: string, env: Env): Promise<Response> {
  const user = await env.DB.prepare(`
    SELECT id, email, display_name, avatar_url, locale, difficulty,
           xp, level, streak, last_practice_date,
           pet_name, pet_species, pet_coins, pet_hunger, pet_intimacy,
           pet_outfit, pet_background,
           tier, tier_expires, notify_enabled
    FROM users WHERE id = ?
  `).bind(userId).first();
  if (!user) return errorResponse('User not found', 404);

  const pet = await env.DB.prepare(`
    SELECT species, name, hunger, intimacy, energy, coins, outfit, background, owned_pets, owned_items, furniture
    FROM pet_state WHERE user_id = ?
  `).bind(userId).first();

  return jsonResponse({ user, pet });
}

async function updateMe(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  const allowed: Record<string, string> = {
    display_name: 'display_name',
    avatar_url: 'avatar_url',
    locale: 'locale',
    difficulty: 'difficulty',
    pet_name: 'pet_name',
    pet_species: 'pet_species',
    pet_coins: 'pet_coins',
    pet_hunger: 'pet_hunger',
    pet_intimacy: 'pet_intimacy',
    pet_outfit: 'pet_outfit',
    pet_background: 'pet_background',
    notify_enabled: 'notify_enabled',
    xp: 'xp',
    level: 'level',
    streak: 'streak',
    last_practice_date: 'last_practice_date',
  };
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, col] of Object.entries(allowed)) {
    if (k in body) {
      sets.push(`${col} = ?`);
      vals.push(body[k]);
    }
  }
  if (sets.length === 0) return errorResponse('No fields to update', 400);
  sets.push('updated_at = ?');
  vals.push(now(), userId);

  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return jsonResponse({ ok: true });
}

async function logout(request: Request, userId: string, env: Env): Promise<Response> {
  // Read refresh token from body to revoke specific session
  let body: any = {};
  try { body = await request.json(); } catch {}
  if (body.refreshToken) {
    const payload = await verifyToken(body.refreshToken, env.REFRESH_SECRET);
    if (payload?.jti) {
      await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?')
        .bind(now(), payload.jti, userId).run();
    }
  }
  // Revoke all sessions for this user if asked
  if (body.allSessions) {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?')
      .bind(now(), userId).run();
  }
  return jsonResponse({ ok: true });
}
