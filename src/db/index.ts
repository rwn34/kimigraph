/**
 * Database connection wrapper for better-sqlite3.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseError } from '../errors';
import { resolveAsset } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqliteVec = require('sqlite-vec');

export class DatabaseConnection {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);

    // Load sqlite-vec extension
    try {
      this.db.loadExtension(sqliteVec.getLoadablePath());
    } catch (err) {
      // sqlite-vec extension failed to load — embeddings will be unavailable
      // but structural graph continues to work
      console.warn('sqlite-vec extension not loaded:', err instanceof Error ? err.message : String(err));
    }

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
    this.db.prepare(sql).run(params ?? []);
  }

  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
    const row = this.db.prepare(sql).get(params ?? []);
    return row ?? null;
  }

  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(params ?? []) as T[];
  }

  transaction<T>(fn: () => T): T {
    this.db.prepare('BEGIN').run();
    try {
      const result = fn();
      this.db.prepare('COMMIT').run();
      return result;
    } catch (err) {
      this.db.prepare('ROLLBACK').run();
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

  /** Check if sqlite-vec is loaded and functional. */
  hasVecExtension(): boolean {
    try {
      const result = this.get<{ v: string }>('SELECT vec_version() as v');
      return !!result?.v;
    } catch {
      return false;
    }
  }
}

export function getDatabasePath(projectRoot: string): string {
  return path.join(projectRoot, '.kimigraph', 'db.sqlite');
}
