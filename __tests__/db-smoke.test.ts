import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../src/db/index';
import { QueryBuilder } from '../src/db/queries';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DB = path.join(process.cwd(), '__tests__', 'smoke-test.db');

describe('Database smoke test', () => {
  let conn: DatabaseConnection;
  let q: QueryBuilder;

  beforeEach(() => {
    fs.rmSync(TEST_DB, { force: true });
    conn = DatabaseConnection.initialize(TEST_DB);
    q = new QueryBuilder(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(TEST_DB, { force: true });
  });

  it('creates schema and stores a node', () => {
    q.upsertNode({
      id: 'func:test.ts:hello:5',
      kind: 'function',
      name: 'hello',
      filePath: 'test.ts',
      startLine: 5,
      endLine: 10,
      language: 'typescript',
      updatedAt: Date.now(),
    });

    const node = q.getNode('func:test.ts:hello:5');
    expect(node).not.toBeNull();
    expect(node!.name).toBe('hello');
    expect(node!.kind).toBe('function');
  });

  it('stores and retrieves edges', () => {
    q.upsertNode({ id: 'a', kind: 'function', name: 'a', filePath: 'a.ts', startLine: 1, endLine: 2, language: 'typescript', updatedAt: 1 });
    q.upsertNode({ id: 'b', kind: 'function', name: 'b', filePath: 'b.ts', startLine: 1, endLine: 2, language: 'typescript', updatedAt: 1 });
    q.insertEdge({ source: 'a', target: 'b', kind: 'calls' });

    const edges = q.getOutgoingEdges('a');
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe('b');
  });

  it('finds nodes by exact name', () => {
    q.upsertNode({ id: 'a', kind: 'function', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 2, language: 'typescript', updatedAt: 1 });
    q.upsertNode({ id: 'b', kind: 'function', name: 'foo', filePath: 'b.ts', startLine: 1, endLine: 2, language: 'typescript', updatedAt: 1 });

    const results = q.findNodesByExactName('foo');
    expect(results).toHaveLength(2);
  });

  it('returns stats', () => {
    const stats = q.getStats();
    expect(stats.files).toBe(0);
    expect(stats.nodes).toBe(0);
    expect(stats.edges).toBe(0);
  });
});

describe('Agent Instructions', () => {
  const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'instructions');

  beforeEach(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimi'), { recursive: true, force: true });
  });

  it('writes AGENTS.md on init', async () => {
    const kg = await KimiGraph.init(FIXTURE_DIR);

    const agentsPath = path.join(FIXTURE_DIR, '.kimi', 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);

    const content = fs.readFileSync(agentsPath, 'utf8');
    expect(content).toContain('kimigraph_explore');
    expect(content).toContain('MANDATORY');

    // Fallback instructions.md also written
    const fallbackPath = path.join(FIXTURE_DIR, '.kimi', 'instructions.md');
    expect(fs.existsSync(fallbackPath)).toBe(true);

    kg.close();
  });
});
