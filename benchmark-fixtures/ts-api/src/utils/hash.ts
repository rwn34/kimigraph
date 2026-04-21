import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 16;
const ITERATIONS = 100000;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

export function comparePassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}
