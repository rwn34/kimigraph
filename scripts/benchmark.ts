/**
 * KimiGraph benchmark harness.
 * Measures how many files the graph covers vs. total files in a project.
 * This is a proxy for the tool-call reduction KimiGraph provides.
 *
 * Usage: npx tsx scripts/benchmark.ts <project-path>
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
}

const EXPLORATION_QUESTIONS = [
  'How does the database layer work?',
  'Trace the reference resolution flow',
  'How is context built for a task?',
];

async function benchmarkProject(projectPath: string): Promise<BenchmarkResult> {
  const absPath = path.resolve(projectPath);
  const projectName = path.basename(absPath);

  // Count total source files (excluding common ignored dirs)
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.kimigraph', '.kimi', 'coverage']);
  const allFiles = fs.readdirSync(absPath, { recursive: true }) as string[];
  const sourceFiles = allFiles.filter((f) => {
    const parts = f.split(path.sep);
    if (parts.some((p) => ignoreDirs.has(p))) return false;
    const ext = path.extname(f).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'].includes(ext);
  });

  // Initialize and index (use open if already initialized)
  let kg: KimiGraph;
  if (fs.existsSync(path.join(absPath, '.kimigraph'))) {
    kg = await KimiGraph.open(absPath);
  } else {
    kg = await KimiGraph.init(absPath);
  }
  await kg.indexAll();

  const questions: BenchmarkResult['questions'] = [];

  for (const query of EXPLORATION_QUESTIONS) {
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
  const fileReductionPercent = Math.round(((sourceFiles.length - avgFilesCovered) / sourceFiles.length) * 100);

  return {
    project: projectName,
    totalFiles: sourceFiles.length,
    questions,
    avgFilesCovered,
    fileReductionPercent,
  };
}

async function main() {
  const projects = process.argv.slice(2);
  if (projects.length === 0) {
    projects.push('.');
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
    console.log(`  Questions:`);
    for (const q of r.questions) {
      console.log(`    - "${q.query}"`);
      console.log(`      → ${q.exploreCalls} explore call, ${q.filesCovered} files, ${q.sectionsReturned} sections`);
    }
    console.log('');
  }

  const avgReduction = Math.round(results.reduce((s, r) => s + r.fileReductionPercent, 0) / results.length);
  console.log(`Overall avg file reduction: ${avgReduction}%`);

  // Write JSON report
  const reportPath = path.join(process.cwd(), 'benchmark-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, overallAvgReduction: avgReduction }, null, 2), 'utf8');
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch(console.error);
