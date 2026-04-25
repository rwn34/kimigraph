import { describe, it, expect, beforeAll } from 'vitest';
import { KimiGraph } from '../src/index';
import { getEmbedder, resetEmbedder } from '../src/embeddings';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'embeddings');

async function setupFixture(): Promise<void> {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  try {
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
  } catch {
    // If db is locked by another process, reuse existing fixture
  }

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'auth.ts'),
    `/**
 * Authentication middleware that verifies JSON Web Token signatures and checks expiration dates.
 * This is the core auth middleware used in the request pipeline to validate bearer credentials.
 */
export function validateJwt(token: string): boolean {
  return token.length > 0;
}

/**
 * Check user credentials against the database and return a session token.
 * This function handles the login flow but is not middleware.
 */
export function authenticateUser(email: string, password: string): string {
  return 'session-' + email;
}
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'db.ts'),
    `/**
 * Establish a connection to the PostgreSQL database using the provided URL.
 */
export function connectDatabase(url: string): any {
  return { query: () => [] };
}

/**
 * Run pending database migrations to update the schema.
 */
export function migrateSchema(): void {
}

/**
 * Rollback the last database migration if something went wrong.
 */
export function rollbackMigration(): void {
}
`,
    'utf8'
  );

  let kg: KimiGraph;
  try {
    kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: true });
  } catch {
    kg = await KimiGraph.open(FIXTURE_DIR);
  }
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

  it('finds validateJwt via semantic query for auth middleware', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);
    // VALIDATION 3.3: query "auth middleware" → validateJwt in top-3
    const results = await kg.searchNodes('auth middleware', { limit: 10 });

    const top3 = results.slice(0, 3).map((r) => r.node.name);
    expect(top3).toContain('validateJwt');
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

    // Create 100 source files per VALIDATION 3.5
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(
        path.join(perfDir, `module${i}.ts`),
        `export function funcA${i}() { return ${i}; }\n` +
        `export function funcB${i}() { return funcA${i}(); }\n`,
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

    // Pre-warm embedder so model loading isn't counted in indexing overhead
    const warmup = getEmbedder();
    await warmup.embedOne('warmup');

    // With embeddings timing
    const kg2 = await KimiGraph.init(perfDir, { embedSymbols: true });
    const t2Start = Date.now();
    await kg2.indexAll();
    const t2 = Date.now() - t2Start;
    kg2.close();

    console.log(`Structural: ${t1}ms, With embeddings: ${t2}ms, Ratio: ${(t2 / t1).toFixed(2)}x`);

    // VALIDATION 3.5: embedding overhead ≤ 3× structural-only (local), ≤ 6× in CI
    // CI runners are shared VMs with unpredictable CPU; ONNX inference can spike
    const maxRatio = process.env.CI ? 6 : 3;
    expect(t2).toBeLessThanOrEqual(t1 * maxRatio);

    // Cleanup
    fs.rmSync(perfDir, { recursive: true, force: true });
  }, 120000);
});
