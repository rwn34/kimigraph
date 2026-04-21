import { hashPassword, comparePassword } from '../utils/hash';
import { query, insert, update, remove } from '../db/connection';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export function listUsers(): User[] {
  return query<User>('SELECT * FROM users');
}

export function findUserById(id: string): User | undefined {
  const results = query<User>('SELECT * FROM users WHERE id = ?', [id]);
  return results[0];
}

export function findUserByEmail(email: string): User | undefined {
  const results = query<User>('SELECT * FROM users WHERE email = ?', [email]);
  return results[0];
}

export function createUser(data: { email: string; name: string; password: string }): User {
  const passwordHash = hashPassword(data.password);
  const id = insert('users', {
    email: data.email,
    name: data.name,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  return { id, ...data, passwordHash, createdAt: new Date() };
}

export function getUser(id: string): User | undefined {
  return findUserById(id);
}

export function updateUser(id: string, data: Partial<User>): User {
  update('users', id, data);
  return findUserById(id)!;
}

export function deleteUser(id: string): void {
  remove('users', id);
}

export function authenticateUser(email: string, password: string): User | null {
  const user = findUserByEmail(email);
  if (!user) return null;
  if (!comparePassword(password, user.passwordHash)) return null;
  return user;
}
