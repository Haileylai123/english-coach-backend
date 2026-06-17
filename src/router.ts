// src/router.ts — Simple route table
import { healthRoute, healthReadyRoute } from './routes/health';
import { Env } from './index';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { syncRoutes } from './routes/sync';
import { aiRoutes } from './routes/ai';
import { subscriptionRoutes } from './routes/subscription';
import { uploadRoutes } from './routes/upload';
import { notificationRoutes } from './routes/notifications';
import { adminRoutes } from './routes/admin';
import { dailyChallengeRoutes } from './routes/daily-challenge';
import { adminUIRoute } from './routes/admin-ui';
import { ttsRoutes } from './routes/tts';
import { jsonResponse, errorResponse, handleCors } from './lib/response';

type Handler = (request: Request, env: Env, ctx: ExecutionContext, userId: string | null) => Promise<Response>;
type AdminHandler = (request: Request, env: Env, ctx: ExecutionContext, userId: string | null, isAdmin: boolean) => Promise<Response>;

const routes: Array<[string, string, Handler | AdminHandler, boolean?]> = [
  // Public
  ['GET', '/api/health', healthRoute as any],
  ['GET', '/api/health/ready', healthReadyRoute as any],
  ['GET', '/admin', adminUIRoute as any],

  // Auth
  ['POST', '/api/auth/register', authRoutes],
  ['POST', '/api/auth/login', authRoutes],
  ['POST', '/api/auth/refresh', authRoutes],

  // User
  ['GET', '/api/user/me', userRoutes],
  ['PATCH', '/api/user/me', userRoutes],
  ['POST', '/api/auth/logout', userRoutes],

  // Sync
  ['GET', '/api/sync/state', syncRoutes],
  ['POST', '/api/sync/state', syncRoutes],
  ['GET', '/api/sync/vocab', syncRoutes],
  ['POST', '/api/sync/vocab', syncRoutes],
  ['DELETE', '/api/sync/vocab', syncRoutes],
  ['GET', '/api/sync/analyses', syncRoutes],
  ['GET', '/api/sync/srs', syncRoutes],
  ['POST', '/api/sync/srs', syncRoutes],
  ['GET', '/api/sync/achievements', syncRoutes],
  ['POST', '/api/sync/achievements', syncRoutes],
  ['GET', '/api/sync/practice', syncRoutes],
  ['POST', '/api/sync/practice', syncRoutes],

  // AI
  ['POST', '/api/ai/analyze', aiRoutes],
  ['POST', '/api/ai/chat', aiRoutes],
  ['POST', '/api/ai/explain', aiRoutes],
  ['GET', '/api/ai/usage', aiRoutes],

  // Subscription
  ['GET', '/api/subscription', subscriptionRoutes],
  ['POST', '/api/subscription/checkout', subscriptionRoutes],
  ['POST', '/api/subscription/cancel', subscriptionRoutes],
  ['POST', '/api/subscription/dev-upgrade', subscriptionRoutes],
  ['POST', '/api/subscription/webhook', subscriptionRoutes],

  // Upload
  ['POST', '/api/upload/audio', uploadRoutes],
  ['GET', '/api/upload/audio', uploadRoutes],

  // Notifications
  ['POST', '/api/notifications/register', notificationRoutes],
  ['POST', '/api/notifications/unregister', notificationRoutes],
  ['POST', '/api/notifications/test', notificationRoutes],

  // TTS (Minimax, R2-cached)
  ['GET', '/api/tts/voices', ttsRoutes],
  ['POST', '/api/tts/speak', ttsRoutes],

  // Admin (gated by ADMIN_EMAILS)
  ['GET', '/api/admin/stats', adminRoutes as any, true],
  ['GET', '/api/admin/users', adminRoutes as any, true],
  ['GET', '/api/admin/ai-usage', adminRoutes as any, true],
  ['GET', '/api/admin/recent-analyses', adminRoutes as any, true],
  ['POST', '/api/admin/broadcast', adminRoutes as any, true],

  // Daily Challenge (today is public; rest require auth)
  ['GET', '/api/daily-challenge/today', dailyChallengeRoutes],
  ['POST', '/api/daily-challenge/complete', dailyChallengeRoutes],
  ['GET', '/api/daily-challenge/leaderboard', dailyChallengeRoutes],
  ['GET', '/api/daily-challenge/streak', dailyChallengeRoutes],
  ['GET', '/api/daily-challenge/my-history', dailyChallengeRoutes],
];

export async function router(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  userId: string | null,
  isAdmin = false,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  for (const [m, p, handler, isAdminRoute] of routes) {
    if (m === method && p === path) {
      if (isAdminRoute) {
        return await (handler as AdminHandler)(request, env, ctx, userId, isAdmin);
      }
      return await (handler as Handler)(request, env, ctx, userId);
    }
  }

  return errorResponse(`Not found: ${method} ${path}`, 404);
}
