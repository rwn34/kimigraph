/**
 * Directory management for KimiGraph.
 */

import * as fs from 'fs';
import * as path from 'path';
import { KIMIGRAPH_DIR } from './config';

export function isInitialized(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, KIMIGRAPH_DIR));
}

export function createDirectory(projectRoot: string): void {
  const dir = path.join(projectRoot, KIMIGRAPH_DIR);
  fs.mkdirSync(dir, { recursive: true });

  // Create .gitignore for the kimigraph directory
  const gitignorePath = path.join(dir, '.gitignore');
  fs.writeFileSync(gitignorePath, '*.db\n*.db-journal\n*.db-wal\n*.db-shm\n', 'utf8');
}

export function getDatabasePath(projectRoot: string): string {
  return path.join(projectRoot, KIMIGRAPH_DIR, 'db.sqlite');
}

export function findNearestKimiGraphRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, KIMIGRAPH_DIR))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function validateDirectory(projectRoot: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const dir = path.join(projectRoot, KIMIGRAPH_DIR);

  if (!fs.existsSync(dir)) {
    errors.push(`${KIMIGRAPH_DIR}/ directory does not exist`);
  }

  return { valid: errors.length === 0, errors };
}
