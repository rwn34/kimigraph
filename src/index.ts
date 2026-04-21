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
} from './types';
import { DatabaseConnection, getDatabasePath } from './db';
import { QueryBuilder } from './db/queries';
import { loadConfig, saveConfig, createDefaultConfig } from './config';
import {
  isInitialized,
  createDirectory,
  validateDirectory,
} from './directory';
import { extractFromSource } from './extraction';
import { initGrammars } from './extraction/grammar';
import { GraphTraverser } from './graph';
import { ContextBuilder } from './context';
import { ReferenceResolver } from './resolution';
import { sha256, readFileSafe, isExcludedPath, Mutex } from './utils';
import * as fs from 'fs';

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
    this.contextBuilder = new ContextBuilder(projectRoot, queries, this.traverser);
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
    this.db.close();
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

      // Process in batches of 100
      const batchSize = 100;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        this.db.transaction(() => {
          for (const filePath of batch) {
            const source = readFileSafe(path.join(this.projectRoot, filePath));
            if (source === null) {
              filesErrored++;
              errors.push({ filePath, message: 'Could not read file' });
              continue;
            }

            const lang = this.detectLanguage(filePath);
            if (!lang) {
              filesSkipped++;
              continue;
            }

            // Remove existing data for this file
            this.queries.deleteNodesByFile(filePath);

            try {
              extractFromSource(filePath, source, lang).catch(() => {});
            } catch (err) {
              filesErrored++;
              errors.push({ filePath, message: String(err) });
            }
          }
        });

        onProgress?.({ phase: 'scanning', current: Math.min(i + batchSize, files.length), total: files.length });
      }

      // Actually extract (async) and write
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const source = readFileSafe(path.join(this.projectRoot, filePath));
        if (!source) continue;

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
        if (!source) continue;

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
          // Modified file
          this.queries.deleteNodesByFile(filePath);
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
          filesModified++;
          nodesUpdated += result.nodes.length;
        }
      }

      this.resolveReferences();

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

  searchNodes(query: string, opts?: SearchOptions): SearchResult[] {
    const limit = opts?.limit ?? 10;

    // Exact match
    const exact = this.queries.findNodesByExactName(query, { ...opts, limit });
    if (exact.length > 0) {
      return exact.map((node) => ({ node, score: 1.0 }));
    }

    // FTS
    const fts = this.queries.searchNodesFTS(query, { ...opts, limit });
    if (fts.length > 0) {
      return fts.map((node) => ({ node, score: 0.8 }));
    }

    // LIKE fallback
    const like = this.queries.searchNodesLike(query, { ...opts, limit });
    return like.map((node) => ({ node, score: 0.5 }));
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

        const size = fs.statSync(path.join(fullDir, entry.name)).size;
        if (size > this.config.maxFileSize) continue;

        if (this.detectLanguage(relPath)) {
          files.push(relPath);
        }
      }
    }
  }

  private detectLanguage(filePath: string): Language | null {
    const ext = path.extname(filePath).toLowerCase();
    for (const [lang, exts] of Object.entries({
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      python: ['.py'],
    })) {
      if ((exts as string[]).includes(ext)) {
        return lang as Language;
      }
    }
    return null;
  }

  private resolveReferences(): void {
    const resolver = new ReferenceResolver(this.queries, this.projectRoot);
    resolver.resolve();
  }
}
