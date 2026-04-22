import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MCP Path tool', () => {
  it('finds shortest path between two symbols', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-path-'));

    fs.writeFileSync(
      path.join(tmpDir, 'a.ts'),
      `export function a() { b(); }`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'b.ts'),
      `export function b() { c(); }`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'c.ts'),
      `export function c() { return 1; }`
    );

    const kg = await KimiGraph.init(tmpDir, { embedSymbols: false });
    await kg.indexAll();

    const { ToolHandler, tools } = await import('../src/mcp/tools');
    const handler = new ToolHandler(kg);

    // Verify tool is registered
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('kimigraph_path');

    const result = await handler.handle('kimigraph_path', {
      from: 'a',
      to: 'c',
    });

    const text = result.content[0].text;
    expect(text).toContain('Path from `a` to `c`');
    expect(text).toContain('function `a`');
    expect(text).toContain('function `c`');

    kg.close();
  });

  it('handles missing symbols gracefully', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-path-missing-'));
    fs.writeFileSync(path.join(tmpDir, 'x.ts'), `export function x() {}`);

    const kg = await KimiGraph.init(tmpDir, { embedSymbols: false });
    await kg.indexAll();

    const { ToolHandler } = await import('../src/mcp/tools');
    const handler = new ToolHandler(kg);

    const result = await handler.handle('kimigraph_path', {
      from: 'x',
      to: 'nonexistent',
    });

    expect(result.content[0].text).toContain('not found');
    kg.close();
  });
});
