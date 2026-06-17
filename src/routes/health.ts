// src/routes/health.ts — Health check endpoints (no circular dependency)
import { Env } from '../index';
import { jsonResponse } from '../lib/response';

export async function healthRoute(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _userId: string | null,
): Promise<Response> {
  return jsonResponse({ status: 'ok', env: env.ENVIRONMENT, time: new Date().toISOString() });
}

export async function healthReadyRoute(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _userId: string | null,
): Promise<Response> {
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
}
