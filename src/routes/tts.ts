// src/routes/tts.ts — Minimax Text-to-Speech with R2 caching
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';

const MINIMAX_TTS_URL = 'https://api.minimax.io/v1/t2a_v2';

const VOICES = {
  en_warm_man: 'English_Trustworth_Man',
  en_warm_woman: 'English_Graceful_Lady',
  en_upbeat_woman: 'English_Upbeat_Woman',
  en_excited_man: 'English_PassionateWarrior',
} as const;
export type VoiceKey = keyof typeof VOICES;

export async function ttsRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/tts/voices' && request.method === 'GET') {
    return jsonResponse({ voices: Object.keys(VOICES).map(k => ({ key: k, id: VOICES[k] })) });
  }

  if (path === '/api/tts/speak' && request.method === 'POST') {
    return await handleSpeak(request, env);
  }

  return errorResponse('TTS route not found', 404);
}

async function handleSpeak(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  const text: string = (body?.text || '').trim();
  if (!text) return errorResponse('text required', 400);
  if (text.length > 5000) return errorResponse('text too long (max 5000 chars)', 400);

  const voiceKey: VoiceKey = body?.voice && body.voice in VOICES ? body.voice : 'en_warm_woman';
  const voiceId = VOICES[voiceKey];

  // Hash text + voice for cache key
  const cacheKey = await hashKey(text + '|' + voiceId);
  const r2Key = `tts/${voiceId}/${cacheKey}.mp3`;

  // Check R2 cache first
  try {
    const cached = await env.AUDIO.get(r2Key);
    if (cached) {
      const audioBytes = await cached.arrayBuffer();
      return new Response(audioBytes, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Cache': 'HIT',
        },
      });
    }
  } catch (e) {
    // R2 miss — continue to synthesis
  }

  // Synthesize via Minimax
  if (!env.MINIMAX_API_KEY) {
    return errorResponse('MINIMAX_API_KEY not configured', 500);
  }

  const speed = typeof body?.speed === 'number' ? Math.max(0.5, Math.min(2.0, body.speed)) : 1.0;

  const res = await fetch(MINIMAX_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.MINIMAX_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-01-turbo',
      text,
      stream: false,
      voice_setting: { voice_id: voiceId, speed, vol: 1.0, pitch: 0 },
      audio_setting: { format: 'mp3', sample_rate: 32000 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return errorResponse(`TTS API error (${res.status}): ${errText}`, 502);
  }

  const data: any = await res.json();
  const baseResp = data?.base_resp;
  if (baseResp && baseResp.status_code !== 0) {
    return errorResponse(`TTS failed: ${baseResp.status_msg || 'unknown'}`, 502);
  }

  const audioHex: string = data?.data?.audio;
  if (!audioHex) return errorResponse('No audio in TTS response', 502);

  const audioBytes = hexToBytes(audioHex);

  // Cache to R2 (best-effort, don't fail if R2 is down)
  env.AUDIO.put(r2Key, audioBytes, {
    httpMetadata: { contentType: 'audio/mpeg' },
  }).catch(() => {});

  return new Response(audioBytes, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      'X-TTS-Cache': 'MISS',
      'X-TTS-Chars': String(text.length),
    },
  });
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function hashKey(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}