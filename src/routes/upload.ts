// src/routes/upload.ts — R2 audio upload + signed download
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { uuid, now } from '../lib/helpers';

export async function uploadRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/upload/audio' && method === 'POST') {
    return await uploadAudio(request, userId, env);
  }
  if (path === '/api/upload/audio' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return errorResponse('id required', 400);
    return await getAudioUrl(id, userId, env);
  }

  return errorResponse('Upload route not found', 404);
}

async function uploadAudio(request: Request, userId: string, env: Env): Promise<Response> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse('Expected multipart/form-data', 400);
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return errorResponse('file field required', 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return errorResponse('File too large (max 10MB)', 413);
  }

  const key = `audio/${userId}/${now()}-${file.name || 'rec.webm'}`;
  await env.AUDIO.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'audio/webm' },
  });

  // Save audio URL to analysis if analysisId provided
  const analysisId = form.get('analysisId')?.toString();
  if (analysisId) {
    await env.DB.prepare('UPDATE analyses SET audio_url = ? WHERE id = ? AND user_id = ?')
      .bind(key, analysisId, userId).run();
  }

  return jsonResponse({ ok: true, key, url: `/api/upload/audio?id=${encodeURIComponent(key)}` });
}

async function getAudioUrl(key: string, userId: string, env: Env): Promise<Response> {
  // Ensure key belongs to this user
  if (!key.startsWith(`audio/${userId}/`)) {
    return errorResponse('Not found', 404);
  }
  const obj = await env.AUDIO.get(key);
  if (!obj) return errorResponse('Audio not found', 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { headers });
}
