/**
 * KimiGraph benchmark harness.
 * Measures how many files the graph covers vs. total files in a project.
 * This is a proxy for the tool-call reduction KimiGraph provides.
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts                    # Run on default 3 fixtures + self
 *   npx tsx scripts/benchmark.ts <project-path>...  # Run on specified projects
 */

import * as path from 'path';
import * as fs from 'fs';
import { KimiGraph } from '../src/index';

interface BenchmarkResult {
  project: string;
  totalFiles: number;
  questions: Array<{
    query: string;
    exploreCalls: number;
    filesCovered: number;
    sectionsReturned: number;
  }>;
  avgFilesCovered: number;
  fileReductionPercent: number;
  toolCallReductionPercent: number;
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

async function benchmarkProject(projectPath: string): Promise<BenchmarkResult> {
  const absPath = path.resolve(projectPath);
  const projectName = path.basename(absPath);
  const startTime = Date.now();

  // Count total source files (excluding common ignored dirs)
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.kimigraph', '.kimi', 'coverage', 'target']);

  function countSourceFiles(dir: string): string[] {
    const files: string[] = [];
    function walk(current: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) walk(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'].includes(ext)) {
            files.push(full);
          }
        }
      }
    }
    walk(dir);
    return files;
  }

  const sourceFiles = countSourceFiles(absPath);

  // Initialize and index (use open if already initialized)
  let kg: KimiGraph;
  if (fs.existsSync(path.join(absPath, '.kimigraph'))) {
    kg = await KimiGraph.open(absPath);
  } else {
    kg = await KimiGraph.init(absPath);
  }
  await kg.indexAll();

  const questions: BenchmarkResult['questions'] = [];

  const questionsToAsk = PROJECT_QUESTIONS[projectName] || DEFAULT_QUESTIONS;
  for (const query of questionsToAsk) {
    const ctx = await kg.buildContext(query, { maxNodes: 20, includeCode: true });

    const coveredFiles = new Set<string>();
    for (const node of [...ctx.entryPoints, ...ctx.relatedNodes]) {
      coveredFiles.add(node.filePath);
    }

    questions.push({
      query,
      exploreCalls: 1,
      filesCovered: coveredFiles.size,
      sectionsReturned: ctx.codeSnippets.size,
    });
  }

  kg.close();

  const avgFilesCovered = questions.reduce((s, q) => s + q.filesCovered, 0) / questions.length;
  const fileReductionPercent = sourceFiles.length > 0
    ? Math.round(((sourceFiles.length - avgFilesCovered) / sourceFiles.length) * 100)
    : 0;

  // Tool-call reduction proxy:
  // Without graph: 1 grep + N file reads = 1 + filesCovered calls
  // With graph: 1 explore call
  const withoutGraphCalls = 1 + avgFilesCovered;
  const withGraphCalls = 1;
  const toolCallReductionPercent = Math.round(
    ((withoutGraphCalls - withGraphCalls) / withoutGraphCalls) * 100
  );

  return {
    project: projectName,
    totalFiles: sourceFiles.length,
    questions,
    avgFilesCovered,
    fileReductionPercent,
    toolCallReductionPercent,
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
    console.log(`  Avg files covered by explore: ${r.avgFilesCovered.toFixed(1)}`);
    console.log(`  File reduction: ${r.fileReductionPercent}%`);
    console.log(`  Tool-call reduction: ${r.toolCallReductionPercent}%`);
    console.log(`  Index duration: ${r.durationMs}ms`);
    console.log(`  Questions:`);
    for (const q of r.questions) {
      console.log(`    - "${q.query}"`);
      console.log(`      → ${q.exploreCalls} explore call, ${q.filesCovered} files, ${q.sectionsReturned} sections`);
    }
    console.log('');
  }

  const validResults = results.filter((r) => r.totalFiles > 0);

  const avgFileReduction = validResults.length > 0
    ? Math.round(validResults.reduce((s, r) => s + r.fileReductionPercent, 0) / validResults.length)
    : 0;
  const avgToolCallReduction = validResults.length > 0
    ? Math.round(validResults.reduce((s, r) => s + r.toolCallReductionPercent, 0) / validResults.length)
    : 0;

  console.log(`Overall avg file reduction across ${validResults.length} repo(s): ${avgFileReduction}%`);
  console.log(`Overall avg tool-call reduction across ${validResults.length} repo(s): ${avgToolCallReduction}%`);

  if (avgToolCallReduction >= 70) {
    console.log(`✅ PASS: ≥70% tool-call reduction threshold met`);
  } else {
    console.log(`❌ FAIL: <70% tool-call reduction threshold`);
  }

  // Write JSON report
  const reportPath = path.join(process.cwd(), 'benchmark-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ results, overallAvgFileReduction: avgFileReduction, overallAvgToolCallReduction: avgToolCallReduction, passed: avgToolCallReduction >= 70 }, null, 2),
    'utf8'
  );
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch(console.error);
