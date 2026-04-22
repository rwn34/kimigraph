import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.join(__dirname, '..');
const SELF_INDEX_DIR = path.join(PROJECT_ROOT, '.kimigraph');

describe('Self-index', () => {
  let kg: KimiGraph;

  beforeAll(async () => {
    // Ensure a clean state
    fs.rmSync(SELF_INDEX_DIR, { recursive: true, force: true });
    kg = await KimiGraph.init(PROJECT_ROOT, { embedSymbols: false });
    await kg.indexAll();
  });

  afterAll(() => {
    kg.close();
    // Leave the self-index in place (it's useful for development)
  });

  it('indexes the project itself with files, nodes, and edges', () => {
    const stats = kg.getStats();

    expect(stats.files).toBeGreaterThan(0);
    expect(stats.nodes).toBeGreaterThan(0);
    expect(stats.edges).toBeGreaterThan(0);

    // Should detect TypeScript source files
    expect(Object.keys(stats.filesByLanguage).length).toBeGreaterThanOrEqual(1);
  });

  it('finds known symbols from the codebase', async () => {
    const results = await kg.searchNodes('extractFromSource');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.node.name === 'extractFromSource')).toBe(true);
  });

  it('can traverse the call graph', async () => {
    const results = await kg.searchNodes('extractFromSource');
    expect(results.length).toBeGreaterThan(0);

    const entry = results[0].node;
    const callers = kg.getCallers(entry.id, 10);
    // Callers may be empty if nothing calls extractFromSource directly,
    // but the method should not throw
    expect(Array.isArray(callers)).toBe(true);
  });
});
