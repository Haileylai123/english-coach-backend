// src/lib/response.ts — JSON response helpers
import { Env } from '../index';

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({ error: message, code: code || `E${status}` }, status);
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCors(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
