import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import { ToolHandler, tools } from '../src/mcp/tools';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'mcp');

describe('MCP Tools', () => {
  beforeEach(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    try {
      fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Windows may hold locks briefly; proceed
    }
  });

  it('registers kimigraph_explore in tool schema', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('kimigraph_explore');
  });

  it('explore returns full source sections', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'auth.ts'),
      `export function validateToken(token: string): boolean {
  return token.length > 0;
}

export function generateToken(): string {
  return Math.random().toString();
}
`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const handler = new ToolHandler(kg);
    const result = await handler.handle('kimigraph_explore', {
      query: 'how does token validation work',
      budget: 'small',
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;

    // Should contain the query
    expect(text).toContain('token validation');

    // Should contain full source code sections
    expect(text).toContain('validateToken');
    expect(text).toContain('return token.length > 0');

    // Should have markdown code blocks
    expect(text).toContain('```');

    // Should have file path annotations
    expect(text).toContain('auth.ts');

    kg.close();
  });

  it('explore gracefully handles nonsense query', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'empty.ts'),
      `export function foo() { return 1; }\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const handler = new ToolHandler(kg);
    const result = await handler.handle('kimigraph_explore', {
      query: 'quantum teleportation algorithm',
      budget: 'small',
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text.toLowerCase()).toContain('no relevant symbols found');

    kg.close();
  });

  it('explore respects budget mapping', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'many.ts'),
      Array.from({ length: 50 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n') + '\n',
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const handler = new ToolHandler(kg);

    const small = await handler.handle('kimigraph_explore', {
      query: 'fn',
      budget: 'small',
    });
    const medium = await handler.handle('kimigraph_explore', {
      query: 'fn',
      budget: 'medium',
    });
    const large = await handler.handle('kimigraph_explore', {
      query: 'fn',
      budget: 'large',
    });

    const smallText = small.content[0].text;
    const mediumText = medium.content[0].text;
    const largeText = large.content[0].text;

    // Larger budgets should return more content
    expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length);
    expect(largeText.length).toBeGreaterThanOrEqual(mediumText.length);

    kg.close();
  });

  it('explore small budget returns ≤5 entry points', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'budget.ts'),
      Array.from({ length: 20 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n') + '\n',
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const handler = new ToolHandler(kg);
    const result = await handler.handle('kimigraph_explore', {
      query: 'fn',
      budget: 'small',
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Extract "Entry Points (N)" from the markdown
    const match = text.match(/Entry Points \((\d+)\)/);
    expect(match).toBeTruthy();
    const entryPointCount = parseInt(match![1], 10);
    expect(entryPointCount).toBeLessThanOrEqual(5);

    kg.close();
  });

  it('explore large budget returns ≥10 symbols total', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'budget-large.ts'),
      Array.from({ length: 50 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n') + '\n',
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const handler = new ToolHandler(kg);
    const result = await handler.handle('kimigraph_explore', {
      query: 'fn',
      budget: 'large',
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Extract counts: "Entry Points (N)" and "Related Symbols (M)"
    const epMatch = text.match(/Entry Points \((\d+)\)/);
    const relMatch = text.match(/Related Symbols \((\d+)\)/);
    const epCount = epMatch ? parseInt(epMatch[1], 10) : 0;
    const relCount = relMatch ? parseInt(relMatch[1], 10) : 0;
    expect(epCount + relCount).toBeGreaterThanOrEqual(10);

    kg.close();
  });
});
