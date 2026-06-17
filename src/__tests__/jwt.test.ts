// src/__tests__/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, hashToken, randomId } from '../lib/jwt';

const SECRET = 'test-secret-key-12345';

describe('JWT — signToken / verifyToken', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signToken({ sub: 'user-1', email: 'a@b.com' }, SECRET, 3600);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const payload = await verifyToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.email).toBe('a@b.com');
    expect(payload!.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns null for token signed with wrong secret', async () => {
    const token = await signToken({ sub: 'user-1' }, SECRET, 3600);
    const payload = await verifyToken(token, 'wrong-secret');
    expect(payload).toBeNull();
  });

  it('returns null for expired token', async () => {
    const token = await signToken({ sub: 'user-1' }, SECRET, -1); // expired 1s ago
    const payload = await verifyToken(token, SECRET);
    expect(payload).toBeNull();
  });

  it('returns null for malformed token', async () => {
    expect(await verifyToken('not.a.token', SECRET)).toBeNull();
    expect(await verifyToken('', SECRET)).toBeNull();
    expect(await verifyToken('a.b', SECRET)).toBeNull();
  });

  it('returns null for tampered payload', async () => {
    const token = await signToken({ sub: 'user-1' }, SECRET, 3600);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${btoa(JSON.stringify({ sub: 'hacker' }))}.${parts[2]}`;
    expect(await verifyToken(tampered, SECRET)).toBeNull();
  });

  it('preserves optional fields', async () => {
    const token = await signToken({ sub: 'u1', email: 'x@y.com', tier: 'pro' }, SECRET, 3600);
    const payload = await verifyToken(token, SECRET);
    expect(payload!.tier).toBe('pro');
  });
});

describe('JWT — hashToken', () => {
  it('produces a consistent hash', async () => {
    const h1 = await hashToken('hello');
    const h2 = await hashToken('hello');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await hashToken('hello');
    const h2 = await hashToken('world');
    expect(h1).not.toBe(h2);
  });
});

describe('JWT — randomId', () => {
  it('generates a string of the requested length', () => {
    expect(randomId()).toHaveLength(21);
    expect(randomId(10)).toHaveLength(10);
    expect(randomId(32)).toHaveLength(32);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });
});
