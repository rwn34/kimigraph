import { createHmac } from 'crypto';

const SECRET = process.env.JWT_SECRET || 'default-secret';

export interface TokenPayload {
  userId: string;
  exp: number;
}

export function signToken(userId: string, expiresInHours = 24): string {
  const payload: TokenPayload = {
    userId,
    exp: Date.now() + expiresInHours * 3600 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = createHmac('sha256', SECRET).update(encoded).digest('base64');
  return `${encoded}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = createHmac('sha256', SECRET).update(encoded).digest('base64');
  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString()) as TokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
