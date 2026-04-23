/**
 * Context builder for KimiGraph.
 * Builds comprehensive code context for a given task/query.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Node,
  TaskContext,
  BuildContextOptions,
  KimiGraphConfig,
} from '../types';
import { QueryBuilder } from '../db/queries';
import { DatabaseConnection } from '../db';
import { GraphTraverser } from '../graph';
import { extractSymbolTokens } from '../utils';
import { getEmbedder } from '../embeddings';

export class ContextBuilder {
  private queries: QueryBuilder;
  private traverser: GraphTraverser;
  private projectRoot: string;
  private db: DatabaseConnection;
  private config: KimiGraphConfig;

  constructor(
    projectRoot: string,
    queries: QueryBuilder,
    traverser: GraphTraverser,
    db: DatabaseConnection,
    config: KimiGraphConfig
  ) {
    this.projectRoot = projectRoot;
    this.queries = queries;
    this.traverser = traverser;
    this.db = db;
    this.config = config;
  }

  async buildContext(
    task: string,
    options: BuildContextOptions = {}
  ): Promise<TaskContext> {
    const { maxNodes = 20, includeCode = true } = options;

    // Step 1: Extract symbol tokens from task
    const tokens = extractSymbolTokens(task);

    // Step 2: Find entry points via search (capped to maxNodes)
    const entryPoints = await this.findEntryPoints(tokens, task, maxNodes);

    // Step 3: Expand via graph traversal
    const relatedNodes = this.expandGraph(entryPoints, maxNodes - entryPoints.length);

    // Step 4: Collect unique nodes
    const allNodes = new Map<string, Node>();
    for (const ep of entryPoints) allNodes.set(ep.id, ep);
    for (const rn of relatedNodes) allNodes.set(rn.id, rn);

    // Step 5: Read source code
    const codeSnippets = new Map<string, string>();
    if (includeCode) {
      for (const node of allNodes.values()) {
        const code = this.getNodeSource(node);
        if (code) codeSnippets.set(node.id, code);
      }
    }

    return {
      summary: this.buildSummary(task, entryPoints, relatedNodes),
      entryPoints,
      relatedNodes: [...relatedNodes],
      codeSnippets,
    };
  }

  private async findEntryPoints(tokens: string[], task: string, maxNodes: number): Promise<Node[]> {
    const results: Node[] = [];
    const seen = new Set<string>();

    const addNodes = (nodes: Node[]) => {
      for (const node of nodes) {
        if (results.length >= maxNodes) break;
        if (!seen.has(node.id)) {
          seen.add(node.id);
          results.push(node);
        }
      }
    };

    // Try exact name matches first (fastest, most precise)
    for (const token of tokens) {
      if (results.length >= maxNodes) break;
      addNodes(this.queries.findNodesByExactName(token, { limit: 5 }));
    }

    // Fill remaining budget with FTS
    if (results.length < maxNodes) {
      addNodes(this.queries.searchNodesFTS(task, { limit: maxNodes - results.length }));
    }

    // Fill remaining budget with semantic search (complements FTS, not just a fallback)
    if (results.length < maxNodes && this.config.embedSymbols && this.db.hasVecExtension()) {
      try {
        const embedder = getEmbedder({
          model: this.config.embeddingModel,
          batchSize: this.config.embeddingBatchSize,
        });
        const queryEmbedding = await embedder.embedOne(task);
        const semantic = this.queries.searchNodesSemantic(queryEmbedding, { limit: maxNodes - results.length });
        addNodes(semantic.map((r) => r.node));
      } catch {
        // Semantic search failed, fall through
      }
    }

    // Last resort: LIKE search
    if (results.length < maxNodes && tokens.length > 0) {
      addNodes(this.queries.searchNodesLike(tokens[0], { limit: maxNodes - results.length }));
    }

    return results;
  }

  private expandGraph(entryPoints: Node[], maxNodes: number): Node[] {
    const result: Node[] = [];
    const seen = new Set<string>(entryPoints.map((n) => n.id));

    for (const ep of entryPoints) {
      if (result.length >= maxNodes) break;

      const subgraph = this.traverser.traverseBFS(ep.id, {
        maxDepth: 2,
        maxNodes: maxNodes - result.length,
        direction: 'both',
        edgeKinds: ['calls', 'imports', 'extends', 'implements', 'contains'],
      });

      for (const node of subgraph.nodes) {
        if (!seen.has(node.id) && node.id !== ep.id) {
          // Skip low-value container nodes that blow the budget
          if (node.kind === 'import' || node.kind === 'export' || node.kind === 'comment' || node.kind === 'file') continue;
          seen.add(node.id);
          result.push(node);
          if (result.length >= maxNodes) break;
        }
      }
    }

    return result;
  }

  private getNodeSource(node: Node): string | null {
    if (node.kind === 'file') return null;

    const absPath = path.join(this.projectRoot, node.filePath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      return lines.slice(node.startLine - 1, node.endLine).join('\n');
    } catch {
      return null;
    }
  }

  private buildSummary(task: string, entryPoints: Node[], relatedNodes: Node[]): string {
    const parts: string[] = [];
    parts.push(`## Task: ${task}`);
    parts.push('');
    parts.push(`Found ${entryPoints.length} entry point(s) and ${relatedNodes.length} related symbol(s).`);

    if (entryPoints.length > 0) {
      parts.push('');
      parts.push('### Entry Points');
      for (const ep of entryPoints) {
        parts.push(`- **${ep.name}** (${ep.kind}) — \`${ep.filePath}:${ep.startLine}\``);
      }
    }

    return parts.join('\n');
  }
}
