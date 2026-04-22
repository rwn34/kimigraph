import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KimiGraph } from '../src/index';
import { ToolHandler } from '../src/mcp/tools';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'mcp-dead-code');

describe('MCP Dead Code and Cycles', () => {
  let kg: KimiGraph;
  let handler: ToolHandler;

  beforeAll(async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });

    // Create a small repo with dead code and a cycle
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'a.ts'),
      `export function used() { return 1; }\nfunction dead() { return 2; }\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'b.ts'),
      `import { used } from './a';\nexport function caller() { return used(); }\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'c.ts'),
      `import { caller } from './b';\nexport function cycleStart() { return caller(); }\n`,
      'utf8'
    );
    // Create a circular import
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'x.ts'),
      `import { y } from './y';\nexport function x() { return y(); }\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'y.ts'),
      `import { x } from './x';\nexport function y() { return x(); }\n`,
      'utf8'
    );

    kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();
    handler = new ToolHandler(kg);
  }, 30000);

  afterAll(() => {
    kg.close();
  });

  it('finds dead code via MCP', async () => {
    const result = await handler.handle('kimigraph_dead_code', {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('dead');
  });

  it('finds circular dependencies via MCP', async () => {
    const result = await handler.handle('kimigraph_cycles', {});
    expect(result.isError).toBeFalsy();
    // The cycle should contain x.ts and y.ts
    const text = result.content[0].text;
    expect(text).toContain('x.ts');
    expect(text).toContain('y.ts');
  });

  it('reports no cycles when none exist', async () => {
    // Use a different fixture dir without cycles
    const cleanDir = path.join(__dirname, 'fixtures', 'mcp-dead-code-clean');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.rmSync(path.join(cleanDir, '.kimigraph'), { recursive: true, force: true });
    fs.writeFileSync(path.join(cleanDir, 'a.ts'), `export function a() {}\n`, 'utf8');
    fs.writeFileSync(path.join(cleanDir, 'b.ts'), `import { a } from './a';\nexport function b() { a(); }\n`, 'utf8');

    const cleanKg = await KimiGraph.init(cleanDir, { embedSymbols: false });
    await cleanKg.indexAll();
    const cleanHandler = new ToolHandler(cleanKg);
    const result = await cleanHandler.handle('kimigraph_cycles', {});
    expect(result.content[0].text).toContain('No circular dependencies');
    cleanKg.close();
  });
});
