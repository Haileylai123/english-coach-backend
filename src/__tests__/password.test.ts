// src/__tests__/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../lib/password';

describe('password — hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const { hash, salt } = await hashPassword('my-secret-password');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(salt).toHaveLength(32); // hex encoded 16 bytes

    const valid = await verifyPassword('my-secret-password', hash, salt);
    expect(valid).toBe(true);
  });

  it('rejects wrong password', async () => {
    const { hash, salt } = await hashPassword('correct-password');
    const valid = await verifyPassword('wrong-password', hash, salt);
    expect(valid).toBe(false);
  });

  it('produces different hashes for the same password (different salts)', async () => {
    const r1 = await hashPassword('same');
    const r2 = await hashPassword('same');
    expect(r1.hash).not.toBe(r2.hash);
    expect(r1.salt).not.toBe(r2.salt);
  });

  it('handles empty password', async () => {
    const { hash, salt } = await hashPassword('');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    const valid = await verifyPassword('', hash, salt);
    expect(valid).toBe(true);
  });

  it('handles unicode passwords', async () => {
    const { hash, salt } = await hashPassword('密碼123!@#');
    const valid = await verifyPassword('密碼123!@#', hash, salt);
    expect(valid).toBe(true);
  });
});
