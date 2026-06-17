// src/routes/stt.ts — Speech-to-Text via Cloudflare Workers AI (Whisper)
// Receives multipart upload from mobile, returns transcribed text.

import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';

export async function sttRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/stt/transcribe' && request.method === 'POST') {
    return await handleTranscribe(request, env);
  }

  return errorResponse('STT route not found', 404);
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('multipart/form-data required (field "audio")', 400);
  }

  const file = formData.get('audio');
  if (!file || !(file instanceof File)) {
    return errorResponse('Missing "audio" file in form data', 400);
  }

  const language = (formData.get('language') as string) || 'en';
  const prompt = (formData.get('prompt') as string) || undefined;

  const arrayBuf = await file.arrayBuffer();
  // Cloudflare Whisper expects an array of int8/uint8 bytes
  const bytes = new Uint8Array(arrayBuf);
  const audioArray = Array.from(bytes);

  try {
    const result: any = await env.AI.run('@cf/openai/whisper', {
      audio: audioArray,
      ...(prompt ? { prompt } : {}),
    });

    const text: string = (result?.text || result?.response?.text || '').trim();
    if (!text) return errorResponse('No speech detected', 422);

    return jsonResponse({
      text,
      language,
      durationMs: result?.duration ?? null,
    });
  } catch (err: any) {
    return errorResponse(`Whisper error: ${err?.message || err}`, 502);
  }
}