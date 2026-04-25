/**
 * KimiGraph — Main public API
 */

import * as path from 'path';
import {
  KimiGraphConfig,
  Node,
  Edge,
  IndexResult,
  SyncResult,
  TaskContext,
  BuildContextOptions,
  GraphStats,
  SearchOptions,
  SearchResult,
  Language,
  detectLanguage,
} from './types';
import { DatabaseConnection, getDatabasePath } from './db';
import { QueryBuilder } from './db/queries';
import { loadConfig, saveConfig, createDefaultConfig } from './config';
import {
  isInitialized,
  createDirectory,
  validateDirectory,
  writeAgentInstructions,
} from './directory';
import { extractFromSource } from './extraction';
import { initGrammars } from './extraction/grammar';
import { GraphTraverser } from './graph';
import { ContextBuilder } from './context';
import { ReferenceResolver } from './resolution';
import { GraphWatcher } from './watcher';
import { sha256, readFileSafe, isExcludedPath, Mutex } from './utils';
import { getEmbedder, resetEmbedder } from './embeddings';
import * as fs from 'fs';

const EMBEDDABLE_KINDS = new Set([
  'function', 'method', 'class', 'interface', 'type_alias',
  'variable', 'constant', 'property', 'enum', 'enum_member',
]);

export { initGrammars } from './extraction/grammar';
export {
  isInitialized,
  findNearestKimiGraphRoot,
} from './directory';
export { createDefaultConfig, loadConfig, saveConfig } from './config';
export { GraphTraverser } from './graph';
export { QueryBuilder } from './db/queries';
export * from './types';

// ============================================================================
// MAIN CLASS
// ============================================================================

export class KimiGraph {
  private db: DatabaseConnection;
  private queries: QueryBuilder;
  private config: KimiGraphConfig;
  private projectRoot: string;
  private traverser: GraphTraverser;
  private contextBuilder: ContextBuilder;
  private watcher: GraphWatcher | null = null;
  private indexMutex = new Mutex();

  private constructor(
    db: DatabaseConnection,
    queries: QueryBuilder,
    config: KimiGraphConfig,
    projectRoot: string
  ) {
    this.db = db;
    this.queries = queries;
    this.config = config;
    this.projectRoot = projectRoot;
    this.traverser = new GraphTraverser(queries);
    this.contextBuilder = new ContextBuilder(projectRoot, queries, this.traverser, db, config);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  static async init(projectRoot: string, config?: Partial<KimiGraphConfig>): Promise<KimiGraph> {
    await initGrammars();
    const resolved = path.resolve(projectRoot);

    if (isInitialized(resolved)) {
      throw new Error(`KimiGraph already initialized in ${resolved}`);
    }

    createDirectory(resolved);
    writeAgentInstructions(resolved);
    const cfg = { ...createDefaultConfig(resolved), ...config };
    saveConfig(resolved, cfg);

    const dbPath = getDatabasePath(resolved);
    const db = DatabaseConnection.initialize(dbPath);
    const queries = new QueryBuilder(db);

    return new KimiGraph(db, queries, cfg, resolved);
  }

  static async open(projectRoot: string): Promise<KimiGraph> {
    await initGrammars();
    const resolved = path.resolve(projectRoot);

    if (!isInitialized(resolved)) {
      throw new Error(`KimiGraph not initialized in ${resolved}. Run: kimigraph init`);
    }

    const validation = validateDirectory(resolved);
    if (!validation.valid) {
      throw new Error(`Invalid KimiGraph directory: ${validation.errors.join(', ')}`);
    }

    const cfg = loadConfig(resolved);
    const dbPath = getDatabasePath(resolved);
    const db = DatabaseConnection.open(dbPath);
    const queries = new QueryBuilder(db);

    return new KimiGraph(db, queries, cfg, resolved);
  }

  static isInitialized(projectRoot: string): boolean {
    return isInitialized(path.resolve(projectRoot));
  }

  close(): void {
    this.unwatch();
    this.db.close();
    resetEmbedder();
  }

  // --------------------------------------------------------------------------
  // WATCHER
  // --------------------------------------------------------------------------

  /** Start watching source files for changes and auto-sync. */
  watch(opts?: { debounceMs?: number }): void {
    if (this.watcher) return;
    this.watcher = new GraphWatcher(
      this.projectRoot,
      async () => { await this.sync(); },
      { debounceMs: opts?.debounceMs, excludePatterns: this.config.exclude }
    );
    this.watcher.start();
  }

  /** Stop watching source files. */
  unwatch(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  /** Whether the graph is stale and waiting for sync. */
  isDirty(): boolean {
    return this.watcher?.isDirty() ?? false;
  }

  /** Sync if the graph is dirty (watcher detected changes). Called before queries. */
  async syncIfDirty(): Promise<void> {
    if (this.watcher?.isDirty()) {
      await this.sync();
    }
  }

  // --------------------------------------------------------------------------
  // Indexing
  // --------------------------------------------------------------------------

  async indexAll(onProgress?: (p: { phase: string; current: number; total: number }) => void): Promise<IndexResult> {
    return this.indexMutex.acquire().then(async () => {
      const startTime = Date.now();
      const errors: Array<{ filePath: string; message: string }> = [];

      // Scan files
      const files = this.scanFiles();
      onProgress?.({ phase: 'scanning', current: 0, total: files.length });

      let nodesCreated = 0;
      let edgesCreated = 0;
      let filesIndexed = 0;
      let filesSkipped = 0;
      let filesErrored = 0;

      // Extract and write in a single pass
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const source = readFileSafe(path.join(this.projectRoot, filePath));
        if (source === null) continue;

        const lang = this.detectLanguage(filePath);
        if (!lang) continue;

        try {
          const result = await extractFromSource(filePath, source, lang);

          this.db.transaction(() => {
            this.queries.deleteNodesByFile(filePath);
            this.queries.deleteUnresolvedRefsByFile(filePath);

            for (const node of result.nodes) {
              this.queries.upsertNode(node);
              nodesCreated++;
            }
            for (const edge of result.edges) {
              this.queries.insertEdge(edge);
              edgesCreated++;
            }
            for (const ref of result.unresolvedRefs) {
              this.queries.insertUnresolvedRef(
                ref.sourceId,
                ref.refName,
                ref.refKind,
                ref.filePath,
                ref.line,
                ref.column
              );
            }

            this.queries.upsertFile({
              path: filePath,
              contentHash: sha256(source),
              language: lang,
              lastIndexed: Date.now(),
              nodeCount: result.nodes.length,
            });
          });

          if (result.errors.length > 0) {
            errors.push(...result.errors);
            filesErrored++;
          } else {
            filesIndexed++;
          }
        } catch (err) {
          filesErrored++;
          errors.push({ filePath, message: String(err) });
        }

        onProgress?.({ phase: 'parsing', current: i + 1, total: files.length });
      }

      // Resolve references
      onProgress?.({ phase: 'resolving', current: 0, total: 1 });
      this.resolveReferences();
      onProgress?.({ phase: 'resolving', current: 1, total: 1 });

      // Generate embeddings
      if (this.config.embedSymbols && this.db.hasVecExtension()) {
        onProgress?.({ phase: 'embedding', current: 0, total: 1 });
        await this.embedAllNodes();
        onProgress?.({ phase: 'embedding', current: 1, total: 1 });
      }

      return {
        success: filesErrored === 0 || filesIndexed > 0,
        filesIndexed,
        filesSkipped,
        filesErrored,
        nodesCreated,
        edgesCreated,
        errors,
        durationMs: Date.now() - startTime,
      };
    }).finally(() => {
      this.indexMutex.release();
    });
  }

  async sync(): Promise<SyncResult> {
    return this.indexMutex.acquire().then(async () => {
      const startTime = Date.now();
      const trackedFiles = this.queries.getAllFiles();
      const currentFiles = new Set(this.scanFiles());

      let filesAdded = 0;
      let filesModified = 0;
      let filesRemoved = 0;
      let nodesUpdated = 0;

      // Check for removed files
      for (const file of trackedFiles) {
        if (!currentFiles.has(file.path)) {
          this.queries.deleteFile(file.path);
          filesRemoved++;
        }
      }

      // Check for new/modified files
      for (const filePath of currentFiles) {
        const source = readFileSafe(path.join(this.projectRoot, filePath));
        if (source === null) continue;

        const lang = this.detectLanguage(filePath);
        if (!lang) continue;

        const existing = this.queries.getFile(filePath);
        const hash = sha256(source);

        if (!existing) {
          // New file
          const result = await extractFromSource(filePath, source, lang);
          this.db.transaction(() => {
            for (const node of result.nodes) this.queries.upsertNode(node);
            for (const edge of result.edges) this.queries.insertEdge(edge);
            for (const ref of result.unresolvedRefs) {
              this.queries.insertUnresolvedRef(ref.sourceId, ref.refName, ref.refKind, ref.filePath, ref.line, ref.column);
            }
            this.queries.upsertFile({
              path: filePath,
              contentHash: hash,
              language: lang,
              lastIndexed: Date.now(),
              nodeCount: result.nodes.length,
            });
          });
          filesAdded++;
          nodesUpdated += result.nodes.length;
        } else if (existing.contentHash !== hash) {
          // Modified file — preserve embeddings for unchanged nodes
          const oldNodes = this.queries.getNodesByFile(filePath);
          const oldById = new Map(oldNodes.map((n) => [n.id, n]));

          this.queries.deleteNodesAndEdgesByFile(filePath);
          this.queries.deleteUnresolvedRefsByFile(filePath);

          const result = await extractFromSource(filePath, source, lang);
          this.db.transaction(() => {
            for (const node of result.nodes) this.queries.upsertNode(node);
            for (const edge of result.edges) this.queries.insertEdge(edge);
            for (const ref of result.unresolvedRefs) {
              this.queries.insertUnresolvedRef(ref.sourceId, ref.refName, ref.refKind, ref.filePath, ref.line, ref.column);
            }
            this.queries.upsertFile({
              path: filePath,
              contentHash: hash,
              language: lang,
              lastIndexed: Date.now(),
              nodeCount: result.nodes.length,
            });
          });

          // Delete embeddings only for removed or changed nodes
          const staleNodeIds: string[] = [];
          const newNodeIds = new Set(result.nodes.map((n) => n.id));
          for (const id of oldById.keys()) {
            if (!newNodeIds.has(id)) {
              staleNodeIds.push(id); // removed
            }
          }
          for (const node of result.nodes) {
            const oldNode = oldById.get(node.id);
            if (oldNode) {
              const fingerprint = (n: typeof node) => `${n.name}|${n.qualifiedName ?? ''}|${n.signature ?? ''}|${n.docstring ?? ''}`;
              if (fingerprint(node) !== fingerprint(oldNode)) {
                staleNodeIds.push(node.id); // changed
              }
            }
          }
          this.queries.deleteEmbeddingsByNodeIds(staleNodeIds);

          filesModified++;
          nodesUpdated += result.nodes.length;
        }
      }

      this.resolveReferences();
      this.queries.pruneDanglingEdges();

      // Generate embeddings for new/modified nodes
      if (this.config.embedSymbols && this.db.hasVecExtension()) {
        await this.embedMissingNodes();
      }

      return {
        filesChecked: currentFiles.size,
        filesAdded,
        filesModified,
        filesRemoved,
        nodesUpdated,
        durationMs: Date.now() - startTime,
      };
    }).finally(() => {
      this.indexMutex.release();
    });
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  async searchNodes(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    const limit = opts?.limit ?? 10;
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    const addResults = (nodes: Node[], score: number) => {
      for (const node of nodes) {
        if (results.length >= limit) break;
        if (!seen.has(node.id)) {
          seen.add(node.id);
          results.push({ node, score });
        }
      }
    };

    // Exact match (highest priority)
    addResults(this.queries.findNodesByExactName(query, { ...opts, limit }), 1.0);

    // FTS (medium priority)
    if (results.length < limit) {
      addResults(this.queries.searchNodesFTS(query, { ...opts, limit: limit - results.length }), 0.8);
    }

    // Semantic search (complements FTS, not just a fallback)
    if (results.length < limit && this.config.embedSymbols && this.db.hasVecExtension()) {
      try {
        const embedder = getEmbedder({ model: this.config.embeddingModel, batchSize: this.config.embeddingBatchSize });
        const queryEmbedding = await embedder.embedOne(query);
        const semantic = this.queries.searchNodesSemantic(queryEmbedding, { ...opts, limit: limit - results.length });
        for (const { node, distance } of semantic) {
          if (results.length >= limit) break;
          if (!seen.has(node.id)) {
            seen.add(node.id);
            results.push({ node, score: Math.max(0, 1 / (1 + distance) - 0.05) });
          }
        }
      } catch {
        // Semantic search failed, fall through
      }
    }

    // LIKE fallback (lowest priority)
    if (results.length < limit) {
      addResults(this.queries.searchNodesLike(query, { ...opts, limit: limit - results.length }), 0.5);
    }

    return results;
  }

  getCallers(nodeId: string, limit = 20): Node[] {
    return this.queries.getCallers(nodeId, limit);
  }

  getCallees(nodeId: string, limit = 20): Node[] {
    return this.queries.getCallees(nodeId, limit);
  }

  getImpactRadius(nodeId: string, depth = 2): Node[] {
    return this.queries.getImpactRadius(nodeId, depth);
  }

  findPath(fromId: string, toId: string): { nodes: Node[]; edges: Edge[] } {
    return this.traverser.findPath(fromId, toId);
  }

  async buildContext(task: string, opts?: BuildContextOptions): Promise<TaskContext> {
    return this.contextBuilder.buildContext(task, opts);
  }

  searchBySignature(query: string, opts?: SearchOptions): SearchResult[] {
    // Parse signature query: "User -> string" or "string, int -> bool" or "-> void"
    const arrowIndex = query.indexOf('->');
    let paramTypes: string[] = [];
    let returnType: string | null = null;

    if (arrowIndex >= 0) {
      const paramPart = query.slice(0, arrowIndex).trim();
      returnType = query.slice(arrowIndex + 2).trim() || null;
      if (paramPart) {
        paramTypes = paramPart.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else {
      // No arrow: treat entire query as parameter type search
      paramTypes = query.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const limit = opts?.limit ?? 10;
    const nodes = this.queries.searchBySignature(paramTypes, returnType, { ...opts, limit });
    return nodes.map((node) => ({ node, score: 1.0 }));
  }

  getNode(id: string): Node | null {
    return this.queries.getNode(id);
  }

  getNodeSource(node: Node): string | null {
    const absPath = path.join(this.projectRoot, node.filePath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      return lines.slice(node.startLine - 1, node.endLine).join('\n');
    } catch {
      return null;
    }
  }

  findDeadCode(limit = 50): Node[] {
    return this.queries.findDeadCode(limit);
  }

  findCircularDependencies(): string[][] {
    return this.queries.findCircularDependencies();
  }

  getStats(): GraphStats {
    const stats = this.queries.getStats();
    stats.dbSizeBytes = this.db.getSize();
    return stats;
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private scanFiles(): string[] {
    const files: string[] = [];
    this.walkDir('.', files);
    return files;
  }

  private walkDir(dir: string, files: string[]): void {
    const fullDir = path.join(this.projectRoot, dir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(fullDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relPath = path.join(dir, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (isExcludedPath(relPath, this.config.exclude)) continue;
        this.walkDir(relPath, files);
      } else if (entry.isFile()) {
        if (isExcludedPath(relPath, this.config.exclude)) continue;

        try {
          const size = fs.statSync(path.join(fullDir, entry.name)).size;
          if (size > this.config.maxFileSize) continue;
        } catch {
          continue; // File may have been deleted between readdir and stat
        }

        if (this.detectLanguage(relPath)) {
          files.push(relPath);
        }
      }
    }
  }

  private detectLanguage(filePath: string): Language | null {
    return detectLanguage(filePath);
  }

  private resolveReferences(): void {
    const resolver = new ReferenceResolver(this.queries, this.projectRoot);
    resolver.resolve();
  }

  // --------------------------------------------------------------------------
  // EMBEDDINGS
  // --------------------------------------------------------------------------

  private async embedAllNodes(): Promise<void> {
    const nodes = this.queries.getAllNodes().filter((n) => EMBEDDABLE_KINDS.has(n.kind));
    await this.embedNodeBatch(nodes);
  }

  private async embedMissingNodes(): Promise<void> {
    const allNodes = this.queries.getAllNodes().filter((n) => EMBEDDABLE_KINDS.has(n.kind));
    if (allNodes.length === 0) return;

    const embeddedRows = this.db.all<{ node_id: string }>('SELECT node_id FROM node_embeddings');
    const embeddedSet = new Set(embeddedRows.map((r) => r.node_id));

    const missing = allNodes.filter((n) => !embeddedSet.has(n.id));
    if (missing.length === 0) return;
    await this.embedNodeBatch(missing);
  }

  private async embedNodeBatch(nodes: Node[]): Promise<void> {
    if (nodes.length === 0) return;

    const embedder = getEmbedder({
      model: this.config.embeddingModel,
      batchSize: this.config.embeddingBatchSize,
    });

    const texts = nodes.map((n) => {
      const parts: string[] = [n.qualifiedName ?? n.name];
      if (n.docstring) parts.push(n.docstring);
      if (n.signature) parts.push(n.signature);
      return parts.join(' ').trim();
    });

    try {
      const embeddings = await embedder.embed(texts);
      this.db.transaction(() => {
        for (let i = 0; i < nodes.length; i++) {
          this.queries.upsertEmbedding(nodes[i].id, embeddings[i]);
        }
      });
    } catch (err) {
      console.warn('Embedding generation failed:', err instanceof Error ? err.message : String(err));
    }
  }
}
