import crypto from 'node:crypto';

const HASH_VERSION = 'pbkdf2-sha256';
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
  return `${HASH_VERSION}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [version, iterationsRaw, salt, hash] = storedHash.split('$');
  const iterations = Number(iterationsRaw);

  if (version !== HASH_VERSION || !Number.isInteger(iterations) || !salt || !hash) {
    return false;
  }

  const candidate = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const stored = Buffer.from(hash, 'base64url');

  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}
