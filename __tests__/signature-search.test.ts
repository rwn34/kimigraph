import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'signature-search');

describe('Type-aware signature search', () => {
  it('finds functions by parameter type', async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });

    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'api.ts'),
      `export function validateToken(token: string): boolean { return true; }\n` +
      `export function parseUser(data: string): User { return {} as User; }\n` +
      `export function add(a: number, b: number): number { return a + b; }\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    // Search by single param type
    const stringResults = kg.searchBySignature('string ->', { limit: 10 });
    expect(stringResults.length).toBeGreaterThanOrEqual(2);
    expect(stringResults.some((r) => r.node.name === 'validateToken')).toBe(true);
    expect(stringResults.some((r) => r.node.name === 'parseUser')).toBe(true);

    // Search by return type
    const boolResults = kg.searchBySignature('-> boolean', { limit: 10 });
    expect(boolResults.some((r) => r.node.name === 'validateToken')).toBe(true);

    // Search by multiple param types
    const numberResults = kg.searchBySignature('number, number -> number', { limit: 10 });
    expect(numberResults.some((r) => r.node.name === 'add')).toBe(true);

    kg.close();
  });
});
