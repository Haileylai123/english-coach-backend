// src/lib/password.ts — PBKDF2 password hashing
// (Workers don't have bcrypt in a portable way; PBKDF2 with 100k+ iterations is solid.)

const enc = new TextEncoder();

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || generateSalt();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(useSalt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return {
    hash: bufferToHex(bits),
    salt: useSalt,
  };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: candidate } = await hashPassword(password, salt);
  return constantTimeEqual(candidate, hash);
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(length = 16): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return bufferToHex(arr.buffer);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
