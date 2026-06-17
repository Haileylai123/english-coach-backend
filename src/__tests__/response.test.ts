// src/__tests__/response.test.ts
import { describe, it, expect } from 'vitest';
import { jsonResponse, errorResponse } from '../lib/response';

describe('response — jsonResponse', () => {
  it('returns a JSON response with correct headers', () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('sets custom status code', () => {
    const res = jsonResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it('encodes body as JSON', async () => {
    const res = jsonResponse({ a: 1, b: 'hello' });
    const body = await res.json();
    expect(body).toEqual({ a: 1, b: 'hello' });
  });
});

describe('response — errorResponse', () => {
  it('returns a JSON error with correct status', () => {
    const res = errorResponse('Something went wrong', 400);
    expect(res.status).toBe(400);
  });

  it('includes error message and code', async () => {
    const res = errorResponse('Not found', 404, 'NOT_FOUND');
    const body = await res.json();
    expect(body.error).toBe('Not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('defaults to 400 status', () => {
    const res = errorResponse('Server error');
    expect(res.status).toBe(400);
  });
});
