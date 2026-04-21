export function validateToken(token: string): boolean {
  return token.length > 0;
}

export function generateToken(): string {
  return Math.random().toString();
}
