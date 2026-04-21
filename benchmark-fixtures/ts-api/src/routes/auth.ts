import { IncomingMessage, ServerResponse } from 'http';
import { verifyToken } from '../utils/jwt';
import { findUserById } from '../services/users';

export interface AuthRequest extends IncomingMessage {
  userId?: string;
}

export function authMiddleware(
  req: AuthRequest,
  res: ServerResponse,
  next: () => void
): void {
  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string') {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Missing token' }));
    return;
  }

  const token = header.replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return;
  }

  const user = findUserById(payload.userId);
  if (!user) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'User not found' }));
    return;
  }

  req.userId = user.id;
  next();
}

export function loginHandler(req: IncomingMessage, res: ServerResponse): void {
  // In a real app, validate credentials and issue token
  res.statusCode = 200;
  res.end(JSON.stringify({ token: 'fake-jwt' }));
}
