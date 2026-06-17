// src/lib/helpers.ts — Shared utility helpers
export function now(): number { return Date.now(); }

export function today(): string { return new Date().toISOString().split('T')[0]; }

export function uuid(): string { return crypto.randomUUID(); }

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Parse JSON safely. */
export function safeJson<T = any>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
