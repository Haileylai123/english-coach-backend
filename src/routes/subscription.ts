// src/routes/subscription.ts — Subscription tier management
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { uuid, now } from '../lib/helpers';

export async function subscriptionRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Public webhook — no auth
  if (path === '/api/subscription/webhook') {
    if (method !== 'POST') return errorResponse('Method not allowed', 405);
    return await handleWebhook(request, env);
  }

  if (!userId) return errorResponse('Unauthorized', 401);

  if (path === '/api/subscription' && method === 'GET') return await getSubscription(userId, env);
  if (path === '/api/subscription/checkout' && method === 'POST') return await startCheckout(request, userId, env);
  if (path === '/api/subscription/cancel' && method === 'POST') return await cancelSubscription(userId, env);
  if (path === '/api/subscription/dev-upgrade' && method === 'POST') return await devUpgrade(request, userId, env);

  return errorResponse('Subscription route not found', 404);
}

async function getSubscription(userId: string, env: Env): Promise<Response> {
  const user = await env.DB.prepare(
    'SELECT tier, tier_expires, stripe_customer_id, apple_sub_id FROM users WHERE id = ?'
  ).bind(userId).first<{ tier: string; tier_expires: number; stripe_customer_id: string; apple_sub_id: string }>();
  if (!user) return errorResponse('User not found', 404);

  const sub = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? AND status = "active" ORDER BY started_at DESC LIMIT 1'
  ).bind(userId).first();

  const features: Record<string, string[]> = {
    free: ['20 AI calls/day', '200 saved words', 'Basic scenes', 'Streak tracking'],
    pro: ['500 AI calls/day', '5000 saved words', 'All scenes + courses', 'Audio history 90 days', 'Priority support'],
    premium: ['Unlimited AI', 'Unlimited words', 'All features', 'Audio history 1 year', 'Custom AI tutor', 'Family share (3 seats)'],
  };

  // Per-market pricing (in local currency)
  const pricing: Record<string, Record<string, { monthly: number; currency: string; symbol: string }>> = {
    free: { pro: { monthly: 0, currency: 'USD', symbol: '$' } },
    pro: { pro: { monthly: 0, currency: 'USD', symbol: '$' } }, // overridden below
  };
  const proPricingByLocale: Record<string, { monthly: number; currency: string; symbol: string }> = {
    'ja': { monthly: 1500, currency: 'JPY', symbol: '¥' },
    'ko': { monthly: 15000, currency: 'KRW', symbol: '₩' },
    'zh-HK': { monthly: 78, currency: 'HKD', symbol: 'HK$' },
    'zh-CN': { monthly: 39, currency: 'CNY', symbol: '¥' },
    'en': { monthly: 9.99, currency: 'USD', symbol: '$' },
  };
  const proPricing = proPricingByLocale['en']; // default
  const premiumPricingByLocale: Record<string, { monthly: number; currency: string; symbol: string }> = {
    'ja': { monthly: 3500, currency: 'JPY', symbol: '¥' },
    'ko': { monthly: 35000, currency: 'KRW', symbol: '₩' },
    'zh-HK': { monthly: 188, currency: 'HKD', symbol: 'HK$' },
    'zh-CN': { monthly: 99, currency: 'CNY', symbol: '¥' },
    'en': { monthly: 19.99, currency: 'USD', symbol: '$' },
  };
  const premiumPricing = premiumPricingByLocale['en'];

  // Look up user's locale for pricing
  const userRow = await env.DB.prepare('SELECT locale FROM users WHERE id = ?').bind(userId).first<{ locale: string }>();
  const userLocale = userRow?.locale || 'en';
  const finalPro = proPricingByLocale[userLocale] || proPricingByLocale['en'];
  const finalPremium = premiumPricingByLocale[userLocale] || premiumPricingByLocale['en'];

  return jsonResponse({
    tier: user.tier,
    expiresAt: user.tier_expires,
    subscription: sub,
    features: features[user.tier] || features.free,
    pricing: {
      pro: finalPro,
      premium: finalPremium,
    },
  });
}

async function startCheckout(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const { tier = 'pro' } = body;

  if (!['pro', 'premium'].includes(tier)) {
    return errorResponse('Invalid tier', 400);
  }

  // ── Stub: real impl would create a Stripe Checkout Session ──
  // For v1, we just return a placeholder and let the app simulate the flow.
  const sessionId = uuid();
  const checkoutUrl = `https://example.com/checkout/${sessionId}?tier=${tier}&user=${userId}`;

  return jsonResponse({
    checkoutUrl,
    sessionId,
    note: 'Stub for v1 — real Stripe integration coming. Use dev mode to upgrade manually.',
  });
}

async function cancelSubscription(userId: string, env: Env): Promise<Response> {
  const t = now();
  await env.DB.prepare(`
    UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE user_id = ? AND status = 'active'
  `).bind(t, userId).run();

  // Revert to free at expiry
  await env.DB.prepare(`
    UPDATE users SET tier = 'free' WHERE id = ? AND tier_expires IS NULL OR tier_expires < ?
  `).bind(userId, t).run();

  return jsonResponse({ ok: true, note: 'Subscription cancelled. Tier will revert to free at expiry.' });
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  // ── Stub for Stripe/Apple webhook verification ──
  // Real impl: verify signature header, parse event, update user tier.
  let body: any = {};
  try { body = await request.json(); } catch {}
  console.log('[subscription webhook]', JSON.stringify(body));
  return jsonResponse({ ok: true });
}

/** Dev-only: instant upgrade (no real payment). Used by the mobile paywall for demo / testing. */
async function devUpgrade(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const tier = body?.tier === 'premium' ? 'premium' : 'pro';
  const t = now();
  const expiresAt = t + 30 * 86400_000; // 30 days
  await env.DB.prepare(
    'UPDATE users SET tier = ?, tier_expires = ? WHERE id = ?'
  ).bind(tier, expiresAt, userId).run();
  await env.DB.prepare(`
    INSERT INTO subscriptions (id, user_id, tier, status, started_at, expires_at, provider)
    VALUES (?, ?, ?, 'active', ?, ?, 'dev')
  `).bind(uuid(), userId, tier, t, expiresAt).run();
  return jsonResponse({ ok: true, tier, expiresAt });
}
