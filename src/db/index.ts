/**
 * Database connection wrapper for node-sqlite3-wasm.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseError } from '../errors';
import { resolveAsset } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database } = require('node-sqlite3-wasm');

export class DatabaseConnection {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);

    // Performance pragmas
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 120000;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
    `);
  }

  static initialize(dbPath: string): DatabaseConnection {
    const conn = new DatabaseConnection(dbPath);
    conn.applySchema();
    return conn;
  }

  static open(dbPath: string): DatabaseConnection {
    return new DatabaseConnection(dbPath);
  }

  applySchema(): void {
    const schemaPath = resolveAsset('db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new DatabaseError(`Schema file not found: ${schemaPath}`);
    }
    const sql = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params?: unknown[]): void {
    this.db.run(sql, params ?? []);
  }

  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
    return this.db.get(sql, params ?? []) as T | null;
  }

  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    return this.db.all(sql, params ?? []) as T[];
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getSize(): number {
    try {
      return fs.statSync(this.dbPath).size;
    } catch {
      return 0;
    }
  }

  close(): void {
    this.db.close();
  }
}

export function getDatabasePath(projectRoot: string): string {
  return path.join(projectRoot, '.kimigraph', 'db.sqlite');
}
