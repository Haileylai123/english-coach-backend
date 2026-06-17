// src/routes/admin.ts — Admin-only stats and user management
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';

export async function adminRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
  isAdmin: boolean,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  if (!isAdmin) return errorResponse('Forbidden — admin only', 403);

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/admin/stats' && request.method === 'GET') return await getStats(env);
  if (path === '/api/admin/users' && request.method === 'GET') return await listUsers(request, env);
  if (path === '/api/admin/ai-usage' && request.method === 'GET') return await getAiUsageStats(env);
  if (path === '/api/admin/recent-analyses' && request.method === 'GET') return await getRecentAnalyses(request, env);
  if (path === '/api/admin/broadcast' && request.method === 'POST') return await broadcast(request, env);

  return errorResponse('Admin route not found', 404);
}

async function getStats(env: Env): Promise<Response> {
  const [
    userCount,
    activeUsers7d,
    proUsers,
    premiumUsers,
    totalAnalyses,
    analysesToday,
    totalVocab,
    totalSessions,
    activeSessions,
  ] = await Promise.all([
    env.DB.prepare('SELECT count(*) AS c FROM users').first<{ c: number }>(),
    env.DB.prepare(`SELECT count(DISTINCT user_id) AS c FROM practice_log WHERE practice_date >= ?`)
      .bind(new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0]).first<{ c: number }>(),
    env.DB.prepare("SELECT count(*) AS c FROM users WHERE tier = 'pro'").first<{ c: number }>(),
    env.DB.prepare("SELECT count(*) AS c FROM users WHERE tier = 'premium'").first<{ c: number }>(),
    env.DB.prepare('SELECT count(*) AS c FROM analyses').first<{ c: number }>(),
    env.DB.prepare("SELECT count(*) AS c FROM analyses WHERE created_at >= ?")
      .bind(new Date(new Date().toISOString().split('T')[0]).getTime()).first<{ c: number }>(),
    env.DB.prepare('SELECT count(*) AS c FROM user_vocab').first<{ c: number }>(),
    env.DB.prepare('SELECT count(*) AS c FROM sessions').first<{ c: number }>(),
    env.DB.prepare('SELECT count(*) AS c FROM sessions WHERE revoked_at IS NULL AND expires_at > ?')
      .bind(Date.now()).first<{ c: number }>(),
  ]);

  return jsonResponse({
    users: {
      total: userCount?.c || 0,
      active7d: activeUsers7d?.c || 0,
      pro: proUsers?.c || 0,
      premium: premiumUsers?.c || 0,
    },
    analyses: {
      total: totalAnalyses?.c || 0,
      today: analysesToday?.c || 0,
    },
    vocab: { total: totalVocab?.c || 0 },
    sessions: { total: totalSessions?.c || 0, active: activeSessions?.c || 0 },
  });
}

async function listUsers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const search = url.searchParams.get('q') || '';
  let query = 'SELECT id, email, display_name, tier, xp, level, streak, created_at FROM users';
  const binds: any[] = [];
  if (search) {
    query += ' WHERE email LIKE ? OR display_name LIKE ?';
    binds.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);
  const res = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse({ users: res.results, limit, offset });
}

async function getAiUsageStats(env: Env): Promise<Response> {
  const res = await env.DB.prepare(`
    SELECT usage_date, SUM(call_count) AS total_calls, SUM(tokens_used) AS total_tokens, COUNT(DISTINCT user_id) AS unique_users
    FROM ai_usage
    WHERE usage_date >= ?
    GROUP BY usage_date
    ORDER BY usage_date DESC
    LIMIT 30
  `).bind(new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]).all();
  return jsonResponse({ daily: res.results });
}

async function getRecentAnalyses(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const res = await env.DB.prepare(`
    SELECT a.id, a.scene, a.overall_score, a.created_at, u.email
    FROM analyses a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).bind(limit).all();
  return jsonResponse({ analyses: res.results });
}

async function broadcast(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!body?.title || !body?.body) return errorResponse('title and body required', 400);

  const tier = body.tier;
  let query = 'SELECT id FROM users';
  const binds: any[] = [];
  if (tier && ['free', 'pro', 'premium'].includes(tier)) {
    query += ' WHERE tier = ?';
    binds.push(tier);
  }
  const users = await env.DB.prepare(query).bind(...binds).all<{ id: string }>();
  const { sendPushToUsers } = await import('../lib/push-fanout');
  const result = await sendPushToUsers(env, users.results.map(u => u.id), {
    title: body.title,
    body: body.body,
    data: { type: 'broadcast' },
  });
  return jsonResponse({ target: users.results.length, ...result });
}
