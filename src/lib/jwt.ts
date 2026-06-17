// src/lib/jwt.ts — HS256 JWT sign/verify using Web Crypto
// (Workers don't have Node's jsonwebtoken, so we implement HS256 from scratch)

export interface JwtPayload {
  sub: string;            // user id
  email?: string;
  tier?: string;
  iat: number;            // issued at (unix s)
  exp: number;            // expires (unix s)
  jti?: string;           // unique id (for refresh tokens)
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? 4 - (padded.length % 4) : 0;
  const b64 = padded + '='.repeat(pad);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function hmacSha256(key: string, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

function timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

export async function signToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSec: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(full)));
  const data = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(secret, data);
  return `${data}.${base64UrlEncode(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = await hmacSha256(secret, data);
    const actualSig = base64UrlDecode(sigB64);
    if (!timingSafeEqual(expectedSig, actualSig.buffer)) return null;
    const payload = JSON.parse(dec.decode(base64UrlDecode(payloadB64))) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return base64UrlEncode(buf);
}

export function randomId(length = 21): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr).slice(0, length);
}
