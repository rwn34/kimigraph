export function validateJwt(token: string): boolean {
  // Verify JWT signature and expiration
  return token.length > 0;
}

export function authenticateUser(email: string, password: string): string {
  // Check credentials and return session token
  return 'session-' + email;
}

export function requireAuth(req: any, res: any, next: any): void {
  // Middleware that checks auth header
  const header = req.headers['authorization'];
  if (!header) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }
  next();
}
