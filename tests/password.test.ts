import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/server/password';

describe('password hashing', () => {
  it('hashes and verifies a password without storing plaintext', () => {
    const hash = hashPassword('CorrectHorse123');

    expect(hash).not.toContain('CorrectHorse123');
    expect(verifyPassword('CorrectHorse123', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });
});
