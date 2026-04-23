/**
 * KimiGraph benchmark harness.
 * Measures real query performance and search strategy effectiveness.
 *
 * Reports:
 *   - Indexing time (structural vs with embeddings)
 *   - Query latency per search strategy (exact, FTS, semantic, LIKE)
 *   - Strategy contribution breakdown (which strategy found relevant nodes)
 *   - File coverage as a secondary metric
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts                    # Run on default fixtures + self
 *   npx tsx scripts/benchmark.ts <project-path>...  # Run on specified projects
 */

import * as path from 'path';
import * as fs from 'fs';
import { KimiGraph } from '../src/index';
import { QueryBuilder } from '../src/db/queries';
import { getEmbedder } from '../src/embeddings';

interface QueryResult {
  query: string;
  latencyMs: number;
  entryPoints: number;
  relatedNodes: number;
  filesCovered: number;
  strategyBreakdown: Record<string, number>;
}

interface BenchmarkResult {
  project: string;
  totalFiles: number;
  structuralIndexMs: number;
  embeddingIndexMs: number | null;
  queries: QueryResult[];
  avgQueryLatencyMs: number;
  durationMs: number;
}

const DEFAULT_PROJECTS = [
  'benchmark-fixtures/ts-api',
  'benchmark-fixtures/go-cli',
  'benchmark-fixtures/rust-lib',
  '.',
];

const DEFAULT_QUESTIONS = [
  'How does the main flow work?',
  'Trace the data processing',
  'What is the architecture?',
];

const PROJECT_QUESTIONS: Record<string, string[]> = {
  'ts-api': [
    'How does authMiddleware verify tokens?',
    'How does createUser hash passwords?',
    'How does startServer route requests?',
  ],
  'go-cli': [
    'How does Builder build targets?',
    'How does Deployer run deployment?',
    'How does config Load settings?',
  ],
  'rust-lib': [
    'How does Pipeline process input?',
    'How does Parser tokenize strings?',
    'How does Validator check data?',
  ],
};

function countSourceFiles(dir: string): number {
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.kimigraph', '.kimi', 'coverage', 'target']);
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.cs']);
  let count = 0;
  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) walk(full);
      } else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

async function benchmarkProject(projectPath: string): Promise<BenchmarkResult> {
  const absPath = path.resolve(projectPath);
  const projectName = path.basename(absPath);
  const startTime = Date.now();

  const totalFiles = countSourceFiles(absPath);

  // Structural index only
  const kgStruct = await KimiGraph.init(absPath, { embedSymbols: false });
  const t0 = Date.now();
  await kgStruct.indexAll();
  const structuralIndexMs = Date.now() - t0;

  // Embedding-enhanced index
  let embeddingIndexMs: number | null = null;
  const kgEmbed = await KimiGraph.init(absPath, { embedSymbols: true });
  const t1 = Date.now();
  await kgEmbed.indexAll();
  embeddingIndexMs = Date.now() - t1;

  kgStruct.close();

  const queries: QueryResult[] = [];
  const questionsToAsk = PROJECT_QUESTIONS[projectName] || DEFAULT_QUESTIONS;

  for (const query of questionsToAsk) {
    const qStart = Date.now();
    const ctx = await kgEmbed.buildContext(query, { maxNodes: 20, includeCode: true });
    const latencyMs = Date.now() - qStart;

    const coveredFiles = new Set<string>();
    for (const node of [...ctx.entryPoints, ...ctx.relatedNodes]) {
      coveredFiles.add(node.filePath);
    }

    // Determine which strategies contributed by re-running them individually
    const db = (kgEmbed as any).db;
    const queriesObj = (kgEmbed as any).queries as QueryBuilder;
    const strategyBreakdown: Record<string, number> = {};

    try {
      strategyBreakdown.exact = queriesObj.findNodesByExactName(query.split(/\s+/)[0] ?? query, { limit: 20 }).length;
    } catch { strategyBreakdown.exact = 0; }

    try {
      strategyBreakdown.fts = queriesObj.searchNodesFTS(query, { limit: 20 }).length;
    } catch { strategyBreakdown.fts = 0; }

    if (db.hasVecExtension()) {
      try {
        const embedder = getEmbedder({ model: 'nomic-ai/nomic-embed-text-v1.5', batchSize: 8 });
        const vec = await embedder.embedOne(query);
        strategyBreakdown.semantic = queriesObj.searchNodesSemantic(vec, { limit: 20 }).length;
      } catch { strategyBreakdown.semantic = 0; }
    }

    try {
      strategyBreakdown.like = queriesObj.searchNodesLike(query.split(/\s+/)[0] ?? query, { limit: 20 }).length;
    } catch { strategyBreakdown.like = 0; }

    queries.push({
      query,
      latencyMs,
      entryPoints: ctx.entryPoints.length,
      relatedNodes: ctx.relatedNodes.length,
      filesCovered: coveredFiles.size,
      strategyBreakdown,
    });
  }

  kgEmbed.close();

  const avgQueryLatencyMs = queries.reduce((s, q) => s + q.latencyMs, 0) / Math.max(1, queries.length);

  return {
    project: projectName,
    totalFiles,
    structuralIndexMs,
    embeddingIndexMs,
    queries,
    avgQueryLatencyMs,
    durationMs: Date.now() - startTime,
  };
}

async function main() {
  let projects = process.argv.slice(2);
  if (projects.length === 0) {
    projects = DEFAULT_PROJECTS;
  }

  const results: BenchmarkResult[] = [];

  for (const project of projects) {
    try {
      console.log(`Benchmarking ${project}...`);
      const result = await benchmarkProject(project);
      results.push(result);
    } catch (err) {
      console.error(`Failed to benchmark ${project}:`, err);
    }
  }

  console.log('\n=== KimiGraph Benchmark Results ===\n');

  for (const r of results) {
    console.log(`Project: ${r.project}`);
    console.log(`  Total source files: ${r.totalFiles}`);
    console.log(`  Structural index: ${r.structuralIndexMs}ms`);
    console.log(`  Embedding index: ${r.embeddingIndexMs ?? 'N/A'}ms`);
    console.log(`  Embedding overhead: ${r.embeddingIndexMs ? `${(r.embeddingIndexMs / r.structuralIndexMs).toFixed(2)}×` : 'N/A'}`);
    console.log(`  Avg query latency: ${r.avgQueryLatencyMs.toFixed(0)}ms`);
    console.log(`  Questions:`);
    for (const q of r.queries) {
      const strategies = Object.entries(q.strategyBreakdown)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`    - "${q.query}"`);
      console.log(`      → ${q.latencyMs}ms, ${q.entryPoints}+${q.relatedNodes} nodes, ${q.filesCovered} files`);
      console.log(`        strategies: ${strategies || 'none'}`);
    }
    console.log();
  }

  const avgLatency = results.reduce((s, r) => s + r.avgQueryLatencyMs, 0) / Math.max(1, results.length);
  console.log(`Average query latency: ${avgLatency.toFixed(0)}ms`);
  console.log();
}

main().catch(console.error);
