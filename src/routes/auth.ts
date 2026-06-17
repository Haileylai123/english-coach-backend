// src/routes/auth.ts — register / login / refresh
import { Env } from '../index';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken, verifyToken, hashToken, randomId } from '../lib/jwt';
import { jsonResponse, errorResponse } from '../lib/response';
import { now } from '../lib/helpers';

export async function authRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _userId: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (path === '/api/auth/register') return await handleRegister(body, env);
  if (path === '/api/auth/login') return await handleLogin(body, env);
  if (path === '/api/auth/refresh') return await handleRefresh(body, env);

  return errorResponse('Unknown auth route', 404);
}

async function handleRegister(body: any, env: Env): Promise<Response> {
  const { email, password, displayName, locale } = body || {};
  if (!email || !password) return errorResponse('Email and password required', 400);
  if (password.length < 6) return errorResponse('Password must be at least 6 characters', 400);
  if (!isValidEmail(email)) return errorResponse('Invalid email format', 400);

  // Check existing
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return errorResponse('Email already registered', 409);

  const { hash, salt } = await hashPassword(password);
  const userId = randomId(21);
  const created = now();

  await env.DB.prepare(`
    INSERT INTO users (id, email, password_hash, password_salt, display_name, locale, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId, email.toLowerCase(), hash, salt, displayName || null, locale || 'zh-HK', created, created
  ).run();

  // Init pet state
  await env.DB.prepare(`
    INSERT INTO pet_state (user_id, species, name, owned_pets, owned_items, furniture, updated_at)
    VALUES (?, 'cat', 'Mimi', '["cat"]', '[]', '[]', ?)
  `).bind(userId, created).run();

  return await issueTokens(userId, email, env, request);
}

async function handleLogin(body: any, env: Env): Promise<Response> {
  const { email, password } = body || {};
  if (!email || !password) return errorResponse('Email and password required', 400);

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, password_salt, tier FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first<{ id: string; email: string; password_hash: string; password_salt: string; tier: string }>();
  if (!user) return errorResponse('Invalid email or password', 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return errorResponse('Invalid email or password', 401);

  return await issueTokens(user.id, user.email, env, request, user.tier);
}

async function handleRefresh(body: any, env: Env): Promise<Response> {
  const { refreshToken } = body || {};
  if (!refreshToken) return errorResponse('Refresh token required', 400);

  const payload = await verifyToken(refreshToken, env.REFRESH_SECRET);
  if (!payload?.sub || !payload.jti) return errorResponse('Invalid refresh token', 401);

  const sessionId = payload.jti;
  const session = await env.DB.prepare(
    'SELECT id, user_id, refresh_hash, expires_at, revoked_at FROM sessions WHERE id = ?'
  ).bind(sessionId).first<{ id: string; user_id: string; refresh_hash: string; expires_at: number; revoked_at: number | null }>();

  if (!session || session.revoked_at || session.expires_at < now()) {
    return errorResponse('Refresh token expired or revoked', 401);
  }
  // Verify token matches the stored hash (rotation protection)
  const tokenHash = await hashToken(refreshToken);
  if (tokenHash !== session.refresh_hash) {
    // Token reuse — revoke all sessions for this user
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').bind(now(), session.user_id).run();
    return errorResponse('Refresh token reuse detected', 401);
  }

  const user = await env.DB.prepare('SELECT email, tier FROM users WHERE id = ?').bind(session.user_id).first<{ email: string; tier: string }>();
  if (!user) return errorResponse('User not found', 404);

  // Rotate: revoke old, issue new
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(now(), sessionId).run();
  return await issueTokens(session.user_id, user.email, env, request, user.tier);
}

async function issueTokens(
  userId: string,
  email: string,
  env: Env,
  request: Request,
  tier = 'free',
): Promise<Response> {
  const accessToken = await signToken({ sub: userId, email, tier }, env.JWT_SECRET, parseInt(env.JWT_EXPIRY, 10));
  const refreshJti = randomId(21);
  const refreshToken = await signToken({ sub: userId, email, tier, jti: refreshJti }, env.REFRESH_SECRET, parseInt(env.REFRESH_EXPIRY, 10));
  const refreshHash = await hashToken(refreshToken);
  const expiresAt = now() + parseInt(env.REFRESH_EXPIRY, 10) * 1000;
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, refresh_hash, device_label, user_agent, ip, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(refreshJti, userId, refreshHash, null, ua, ip, expiresAt, now()).run();

  return jsonResponse({
    accessToken,
    refreshToken,
    expiresIn: parseInt(env.JWT_EXPIRY, 10),
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
