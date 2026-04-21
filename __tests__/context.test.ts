import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'context');

describe('Context Builder', () => {
  beforeEach(async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
  });

  it('builds context for a task', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'auth.ts'),
      `export function validateToken(token: string): boolean {\n  return token.length > 0;\n}\n\nexport function generateToken(): string {\n  return Math.random().toString();\n}\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR);
    await kg.indexAll();

    const ctx = await kg.buildContext('how does token validation work', { maxNodes: 10 });

    expect(ctx.entryPoints.length).toBeGreaterThanOrEqual(1);
    const names = ctx.entryPoints.map((n) => n.name);
    expect(names.some((n) => n.toLowerCase().includes('valid'))).toBe(true);

    kg.close();
  });

  it('includes related symbols', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'math.ts'),
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function subtract(a: number, b: number): number {\n  return a - b;\n}\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR);
    await kg.indexAll();

    const ctx = await kg.buildContext('math operations', { maxNodes: 10 });

    const allNames = [...ctx.entryPoints, ...ctx.relatedNodes].map((n) => n.name);
    expect(allNames.some((n) => n.includes('add') || n.includes('subtract'))).toBe(true);

    kg.close();
  });
});
