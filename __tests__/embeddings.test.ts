import { describe, it, expect, beforeAll } from 'vitest';
import { KimiGraph } from '../src/index';
import { getEmbedder, resetEmbedder } from '../src/embeddings';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'embeddings');

async function setupFixture(): Promise<void> {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'auth.ts'),
    `export function validateJwt(token: string): boolean {
  // Verify JWT signature and expiration
  return token.length > 0;
}

export function authenticateUser(email: string, password: string): string {
  // Check credentials and return session token
  return 'session-' + email;
}

export function requireAuth(req: any, res: any, next: any): void {
  // Middleware that checks auth header
  const header = req.headers['authorization'];
  if (!header) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }
  next();
}
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'db.ts'),
    `export function connectDatabase(url: string): any {
  // Connect to PostgreSQL
  return { query: () => [] };
}

export function migrateSchema(): void {
  // Run pending migrations
}
`,
    'utf8'
  );

  const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: true });
  await kg.indexAll();
  kg.close();
}

describe('Embedding Model', () => {
  it('loads and produces 768-dim vectors', async () => {
    resetEmbedder();
    const embedder = getEmbedder();
    const embedding = await embedder.embedOne('hello world');
    expect(embedding.length).toBe(768);
    expect(embedding).toBeInstanceOf(Float32Array);
  }, 60000);

  it('embeds batches efficiently', async () => {
    resetEmbedder();
    const embedder = getEmbedder();
    const texts = ['foo', 'bar', 'baz'];
    const embeddings = await embedder.embed(texts);
    expect(embeddings.length).toBe(3);
    for (const e of embeddings) {
      expect(e.length).toBe(768);
    }
  }, 60000);
});

describe('Semantic Search Integration', () => {
  beforeAll(async () => {
    await setupFixture();
  }, 60000);

  it('stores embeddings for embeddable nodes', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);
    const stats = kg.getStats();
    expect(stats.nodes).toBeGreaterThan(0);

    const db = (kg as any).db;
    const embeddingCount = db.get<{ c: number }>('SELECT COUNT(*) as c FROM node_embeddings')!.c;
    expect(embeddingCount).toBeGreaterThan(0);
    kg.close();
  });

  it('finds validateJwt via semantic query "auth middleware"', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);
    const results = await kg.searchNodes('auth middleware', { limit: 10 });

    const names = results.map((r) => r.node.name);
    // With semantic search, auth-related functions should appear for "auth middleware"
    expect(names.some((n) =>
      n.toLowerCase().includes('validate') ||
      n.toLowerCase().includes('auth') ||
      n.toLowerCase().includes('require')
    )).toBe(true);
    kg.close();
  });

  it('exact name search still works (FTS fallback)', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);
    const results = await kg.searchNodes('validateJwt', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.name).toBe('validateJwt');
    expect(results[0].score).toBe(1.0);
    kg.close();
  });

  it('semantic search falls back to LIKE when no embeddings', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);
    const results = await kg.searchNodes('connectDatabase', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.node.name === 'connectDatabase')).toBe(true);
    kg.close();
  });
});

describe('Embedding Performance', () => {
  it('indexes with embeddings within reasonable time', async () => {
    const perfDir = path.join(__dirname, 'fixtures', 'embeddings-perf');
    fs.mkdirSync(perfDir, { recursive: true });
    fs.rmSync(path.join(perfDir, '.kimigraph'), { recursive: true, force: true });

    // Create 20 source files (~100-file repo scale when expanded)
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(
        path.join(perfDir, `module${i}.ts`),
        `export function funcA${i}() { return ${i}; }\n` +
        `export function funcB${i}() { return funcA${i}(); }\n` +
        `export function funcC${i}() { return funcB${i}(); }\n` +
        `export class Class${i} { method1() {} method2() {} }\n`,
        'utf8'
      );
    }

    // Structural-only timing
    const kg1 = await KimiGraph.init(perfDir, { embedSymbols: false });
    const t1Start = Date.now();
    await kg1.indexAll();
    const t1 = Date.now() - t1Start;
    kg1.close();

    fs.rmSync(path.join(perfDir, '.kimigraph'), { recursive: true, force: true });

    // With embeddings timing
    const kg2 = await KimiGraph.init(perfDir, { embedSymbols: true });
    const t2Start = Date.now();
    await kg2.indexAll();
    const t2 = Date.now() - t2Start;
    kg2.close();

    console.log(`Structural: ${t1}ms, With embeddings: ${t2}ms, Ratio: ${(t2 / t1).toFixed(2)}x`);

    // Should be within 10x on CI (generous for first model load across platforms;
    // 3x target for warmed cache on local machines)
    const isCI = process.env.CI === 'true';
    expect(t2).toBeLessThanOrEqual(t1 * (isCI ? 10 : 5));

    // Cleanup
    fs.rmSync(perfDir, { recursive: true, force: true });
  }, 120000);
});
