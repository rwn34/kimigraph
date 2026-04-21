import { Database } from 'sqlite3';

let db: Database | null = null;

export function getConnection(): Database {
  if (!db) {
    db = new Database(process.env.DATABASE_URL || './data.db');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  const connection = getConnection();
  connection.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
}

export function query<T>(sql: string, params?: unknown[]): T[] {
  const conn = getConnection();
  // Simplified — real impl would use promises
  return [] as T[];
}

export function insert(table: string, data: Record<string, unknown>): string {
  const conn = getConnection();
  const id = generateId();
  // Simplified
  return id;
}

export function update(table: string, id: string, data: Record<string, unknown>): void {
  const conn = getConnection();
  // Simplified
}

export function remove(table: string, id: string): void {
  const conn = getConnection();
  // Simplified
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
