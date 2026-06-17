// src/routes/notifications.ts — Register / unregister / test push tokens
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { registerToken, unregisterToken, sendPushToUser } from '../lib/push-fanout';

export async function notificationRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/notifications/register' && method === 'POST') return await handleRegister(request, userId, env);
  if (path === '/api/notifications/unregister' && method === 'POST') return await handleUnregister(request, userId, env);
  if (path === '/api/notifications/test' && method === 'POST') return await handleTest(userId, env);

  return errorResponse('Notification route not found', 404);
}

async function handleRegister(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!body?.token) return errorResponse('token required', 400);
  await registerToken(env, userId, body.token, body.platform);
  return jsonResponse({ ok: true });
}

async function handleUnregister(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!body?.token) return errorResponse('token required', 400);
  await unregisterToken(env, userId, body.token);
  return jsonResponse({ ok: true });
}

async function handleTest(userId: string, env: Env): Promise<Response> {
  const result = await sendPushToUser(env, userId, {
    title: '🎉 English Coach',
    body: 'Test notification — your push setup works!',
    data: { type: 'test' },
  });
  return jsonResponse(result);
}
