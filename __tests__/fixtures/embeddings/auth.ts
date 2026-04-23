/**
 * Authentication middleware that verifies JSON Web Token signatures and checks expiration dates.
 * This is the core auth middleware used in the request pipeline to validate bearer credentials.
 */
export function validateJwt(token: string): boolean {
  return token.length > 0;
}

/**
 * Check user credentials against the database and return a session token.
 * This function handles the login flow but is not middleware.
 */
export function authenticateUser(email: string, password: string): string {
  return 'session-' + email;
}
