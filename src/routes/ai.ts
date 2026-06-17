// src/routes/ai.ts — Claude API proxy with quota enforcement
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { callClaude } from '../lib/claude';
import { getAiUsageToday, incrementAiUsage } from '../lib/rate-limit';
import { uuid, now } from '../lib/helpers';

export async function aiRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/ai/usage' && method === 'GET') {
    const { used, limit } = await getAiUsageToday(env, userId);
    return jsonResponse({ used, limit, remaining: limit === Infinity ? Infinity : Math.max(0, limit - used) });
  }

  if (method !== 'POST') return errorResponse('Method not allowed', 405);

  // ── Enforce AI quota ──
  const { used, limit } = await getAiUsageToday(env, userId);
  if (limit !== Infinity && used >= limit) {
    return errorResponse(`AI quota exhausted (${used}/${limit}). Upgrade to Pro for more.`, 429, 'AI_QUOTA');
  }

  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  let result: { content: string; input_tokens: number; output_tokens: number };
  try {
    if (path === '/api/ai/analyze') {
      result = await handleAnalyze(body, env);
    } else if (path === '/api/ai/chat') {
      result = await handleChat(body, env);
    } else if (path === '/api/ai/explain') {
      result = await handleExplain(body, env);
    } else {
      return errorResponse('AI route not found', 404);
    }
  } catch (e: any) {
    return errorResponse(e?.message || 'AI call failed', 500);
  }

  await incrementAiUsage(env, userId, result.input_tokens + result.output_tokens);
  return jsonResponse({ content: result.content, usage: { input: result.input_tokens, output: result.output_tokens } });
}

async function handleAnalyze(body: any, env: Env): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const { transcript, scene, scores, locale } = body || {};
  if (!transcript) return Promise.reject(new Error('Transcript required'));

  const sys = `You are a friendly English tutor. The user just practiced the "${scene || 'general'}" scene. Be specific, encouraging, and brief. Respond in ${locale || 'English'}.`;
  const userMsg = `Analyze this speech transcript:

TRANSCRIPT: "${transcript}"

LOCAL SCORES (0-100):
- Overall: ${scores?.overall ?? 'n/a'}
- Fluency: ${scores?.fluency ?? 'n/a'} (WPM: ${scores?.wpm ?? '?'}, fillers: ${scores?.fillers ?? '?'}%)
- Vocabulary: ${scores?.vocab ?? 'n/a'} (${scores?.uniqueWords ?? '?'} unique words)
- Grammar: ${scores?.grammar ?? 'n/a'} (${scores?.sentences ?? '?'} sentences, ${scores?.errors ?? '?'} errors)

Respond ONLY with this exact JSON (no markdown):
{"overall_comment":"2-3 sentences","strengths":["strength 1","strength 2"],"improvements":["specific tip 1","specific tip 2"],"next_practice":"one concrete suggestion"}`;

  return await callClaude(env, {
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 600,
  });
}

async function handleChat(body: any, env: Env): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const { messages, scene, locale, level } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) return Promise.reject(new Error('Messages required'));

  const sys = `You are a friendly English conversation partner for a ${level || 'beginner'} learner practicing the "${scene || 'general'}" scene. Keep responses short (1-3 sentences). Mix simple sentences. Use ${locale || 'English'} for any meta-commentary but reply in English. Correct mistakes gently.`;

  return await callClaude(env, {
    system: sys,
    messages,
    max_tokens: 300,
  });
}

async function handleExplain(body: any, env: Env): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const { word, sentence, locale } = body || {};
  if (!word) return Promise.reject(new Error('Word required'));

  const sys = `You are an English vocabulary tutor. Explain the word, give 2 example sentences, and 1 common mistake. Reply in ${locale || 'English'}.`;
  const userMsg = `Word: "${word}"
${sentence ? `In context: "${sentence}"` : ''}

Respond ONLY with this JSON (no markdown):
{"definition":"simple definition","examples":["example 1","example 2"],"mistake":"one common learner mistake","related":["related word 1","related word 2"]}`;

  return await callClaude(env, {
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 400,
  });
}
