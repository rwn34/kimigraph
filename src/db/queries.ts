/**
 * SQL query builder for KimiGraph.
 * All database queries live here for centralized maintenance.
 */

import {
  Node,
  Edge,
  NodeKind,
  EdgeKind,
  FileRecord,
  Language,
  GraphStats,
  SearchOptions,
} from '../types';
import { DatabaseConnection } from './index';
import { logDebug } from '../errors';

export class QueryBuilder {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  upsertFile(record: FileRecord): void {
    this.db.run(
      `INSERT OR REPLACE INTO files (path, content_hash, language, last_indexed, node_count)
       VALUES (?, ?, ?, ?, ?)`,
      [record.path, record.contentHash, record.language, record.lastIndexed, record.nodeCount]
    );
  }

  getFile(filePath: string): FileRecord | null {
    const row = this.db.get<{ path: string; content_hash: string; language: string; last_indexed: number; node_count: number }>(
      'SELECT * FROM files WHERE path = ?',
      [filePath]
    );
    return row ? this.rowToFile(row) : null;
  }

  getAllFiles(): FileRecord[] {
    const rows = this.db.all<{ path: string; content_hash: string; language: string; last_indexed: number; node_count: number }>(
      'SELECT * FROM files'
    );
    return rows.map(this.rowToFile);
  }

  deleteFile(filePath: string): void {
    // Cascade deletes nodes (and their edges via application-level cleanup)
    this.deleteNodesByFile(filePath);
    this.db.run('DELETE FROM files WHERE path = ?', [filePath]);
    this.db.run('DELETE FROM unresolved_refs WHERE file_path = ?', [filePath]);
  }

  // ==========================================================================
  // NODE OPERATIONS
  // ==========================================================================

  upsertNode(node: Node): void {
    this.db.run(
      `INSERT OR REPLACE INTO nodes
       (id, kind, name, qualified_name, file_path, start_line, end_line,
        start_column, end_column, language, signature, docstring,
        is_exported, is_async, is_static, is_abstract, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.kind,
        node.name,
        node.qualifiedName ?? null,
        node.filePath,
        node.startLine,
        node.endLine,
        node.startColumn ?? null,
        node.endColumn ?? null,
        node.language,
        node.signature ?? null,
        node.docstring ?? null,
        node.isExported ? 1 : 0,
        node.isAsync ? 1 : 0,
        node.isStatic ? 1 : 0,
        node.isAbstract ? 1 : 0,
        node.updatedAt,
      ]
    );
  }

  getNode(id: string): Node | null {
    const row = this.db.get<RawNode>('SELECT * FROM nodes WHERE id = ?', [id]);
    return row ? this.rowToNode(row) : null;
  }

  getNodesByFile(filePath: string): Node[] {
    const rows = this.db.all<RawNode>('SELECT * FROM nodes WHERE file_path = ?', [filePath]);
    return rows.map(this.rowToNode);
  }

  getNodesByKind(kind: NodeKind): Node[] {
    const rows = this.db.all<RawNode>('SELECT * FROM nodes WHERE kind = ?', [kind]);
    return rows.map(this.rowToNode);
  }

  findNodesByExactName(name: string, opts: SearchOptions = {}): Node[] {
    const { kinds, languages, limit = 20 } = opts;
    const conditions: string[] = ['name = ?'];
    const params: unknown[] = [name];

    if (kinds && kinds.length > 0) {
      conditions.push(`kind IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
    if (languages && languages.length > 0) {
      conditions.push(`language IN (${languages.map(() => '?').join(',')})`);
      params.push(...languages);
    }
    params.push(limit);

    const rows = this.db.all<RawNode>(
      `SELECT * FROM nodes WHERE ${conditions.join(' AND ')} LIMIT ?`,
      params
    );
    return rows.map(this.rowToNode);
  }

  searchNodesFTS(query: string, opts: SearchOptions = {}): Node[] {
    const { kinds, languages, limit = 20 } = opts;

    // Sanitize for FTS5: strip special chars and append wildcard
    const safe = query
      .replace(/\b(AND|OR|NOT)\b/gi, ' ')
      .replace(/['"*()?\-+^~:{}\\.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!safe) return [];

    const ftsQuery = safe + '*';
    const safeLimit = Math.max(1, Math.floor(Number(limit)));

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (kinds && kinds.length > 0) {
      conditions.push(`kind IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
    if (languages && languages.length > 0) {
      conditions.push(`language IN (${languages.map(() => '?').join(',')})`);
      params.push(...languages);
    }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // Use parameter binding for the MATCH query
    params.unshift(ftsQuery);
    const sql = `SELECT * FROM nodes
      WHERE rowid IN (SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH ?)
      ${where}
      LIMIT ${safeLimit}`;

    logDebug('FTS search SQL:', sql);
    const rows = this.db.all<RawNode>(sql, params);
    return rows.map(this.rowToNode);
  }

  searchNodesLike(name: string, opts: SearchOptions = {}): Node[] {
    const { kinds, languages, limit = 20 } = opts;
    const pattern = `%${name}%`;
    const conditions: string[] = ['name LIKE ?'];
    const params: unknown[] = [pattern];

    if (kinds && kinds.length > 0) {
      conditions.push(`kind IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
    if (languages && languages.length > 0) {
      conditions.push(`language IN (${languages.map(() => '?').join(',')})`);
      params.push(...languages);
    }
    params.push(limit);

    const rows = this.db.all<RawNode>(
      `SELECT * FROM nodes WHERE ${conditions.join(' AND ')} LIMIT ?`,
      params
    );
    return rows.map(this.rowToNode);
  }

  deleteNodesByFile(filePath: string): void {
    const ids = this.db.all<{ id: string }>('SELECT id FROM nodes WHERE file_path = ?', [filePath]);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.run(`DELETE FROM edges WHERE source IN (${placeholders}) OR target IN (${placeholders})`, [
      ...ids.map((r) => r.id),
      ...ids.map((r) => r.id),
    ]);
    try {
      this.db.run(`DELETE FROM node_embeddings WHERE node_id IN (${placeholders})`, ids.map((r) => r.id));
    } catch {
      // node_embeddings may not exist in old schemas
    }
    this.db.run('DELETE FROM nodes WHERE file_path = ?', [filePath]);
  }

  deleteNodesAndEdgesByFile(filePath: string): void {
    const ids = this.db.all<{ id: string }>('SELECT id FROM nodes WHERE file_path = ?', [filePath]);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    // Only delete outgoing edges from this file; preserve incoming cross-file edges
    this.db.run(`DELETE FROM edges WHERE source IN (${placeholders})`, ids.map((r) => r.id));
    this.db.run('DELETE FROM nodes WHERE file_path = ?', [filePath]);
  }

  pruneDanglingEdges(): void {
    this.db.run(`DELETE FROM edges WHERE source NOT IN (SELECT id FROM nodes) OR target NOT IN (SELECT id FROM nodes)`);
  }

  // ==========================================================================
  // EDGE OPERATIONS
  // ==========================================================================

  insertEdge(edge: Edge): void {
    this.db.run(
      `INSERT OR IGNORE INTO edges (source, target, kind, line, column)
       VALUES (?, ?, ?, ?, ?)`,
      [edge.source, edge.target, edge.kind, edge.line ?? null, edge.column ?? null]
    );
  }

  getOutgoingEdges(nodeId: string): Edge[] {
    const rows = this.db.all<RawEdge>('SELECT * FROM edges WHERE source = ?', [nodeId]);
    return rows.map(this.rowToEdge);
  }

  getIncomingEdges(nodeId: string): Edge[] {
    const rows = this.db.all<RawEdge>('SELECT * FROM edges WHERE target = ?', [nodeId]);
    return rows.map(this.rowToEdge);
  }

  getEdgesForNodes(nodeIds: string[]): Edge[] {
    if (nodeIds.length === 0) return [];
    const placeholders = nodeIds.map(() => '?').join(',');
    const rows = this.db.all<RawEdge>(
      `SELECT * FROM edges WHERE source IN (${placeholders}) OR target IN (${placeholders})`,
      [...nodeIds, ...nodeIds]
    );
    return rows.map(this.rowToEdge);
  }

  // ==========================================================================
  // CALL GRAPH
  // ==========================================================================

  getCallers(nodeId: string, limit = 30): Node[] {
    const rows = this.db.all<RawNode>(
      `SELECT n.* FROM nodes n
       JOIN edges e ON e.source = n.id
       WHERE e.target = ? AND e.kind = 'calls'
       LIMIT ?`,
      [nodeId, limit]
    );
    return rows.map(this.rowToNode);
  }

  getCallees(nodeId: string, limit = 30): Node[] {
    const rows = this.db.all<RawNode>(
      `SELECT n.* FROM nodes n
       JOIN edges e ON e.target = n.id
       WHERE e.source = ? AND e.kind = 'calls'
       LIMIT ?`,
      [nodeId, limit]
    );
    return rows.map(this.rowToNode);
  }

  // ==========================================================================
  // IMPACT RADIUS (BFS over incoming edges)
  // ==========================================================================

  getImpactRadius(nodeId: string, depth = 2): Node[] {
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];

    for (let d = 0; d < depth; d++) {
      if (frontier.length === 0) break;
      const placeholders = frontier.map(() => '?').join(',');
      const rows = this.db.all<{ source: string }>(
        `SELECT DISTINCT source FROM edges
         WHERE target IN (${placeholders})
         AND kind IN ('calls', 'imports', 'extends', 'ffi')`,
        frontier
      );
      frontier = [];
      for (const row of rows) {
        if (!visited.has(row.source)) {
          visited.add(row.source);
          frontier.push(row.source);
        }
      }
    }

    visited.delete(nodeId);
    if (visited.size === 0) return [];
    const ids = [...visited];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.all<RawNode>(
      `SELECT * FROM nodes WHERE id IN (${placeholders})`,
      ids
    );
    return rows.map(this.rowToNode);
  }

  // ==========================================================================
  // PATH FINDING (BFS shortest path)
  // ==========================================================================

  findPath(fromId: string, toId: string, maxDepth = 10): Node[] {
    if (fromId === toId) {
      const node = this.getNode(fromId);
      return node ? [node] : [];
    }

    const prev = new Map<string, string>();
    const queue: string[] = [fromId];
    const visited = new Set<string>([fromId]);
    let depth = 0;

    outer: while (queue.length > 0 && depth < maxDepth) {
      const levelSize = queue.length;
      depth++;
      for (let i = 0; i < levelSize; i++) {
        const current = queue.shift()!;
        const rows = this.db.all<{ target: string }>(
          `SELECT DISTINCT target FROM edges WHERE source = ?`,
          [current]
        );
        for (const row of rows) {
          if (!visited.has(row.target)) {
            visited.add(row.target);
            prev.set(row.target, current);
            if (row.target === toId) break outer;
            queue.push(row.target);
          }
        }
      }
    }

    if (!prev.has(toId)) return [];

    const pathIds: string[] = [];
    let cur: string | undefined = toId;
    while (cur !== undefined) {
      pathIds.unshift(cur);
      cur = prev.get(cur);
    }

    return pathIds.map((id) => this.getNode(id)).filter((n): n is Node => n !== null);
  }

  // ==========================================================================
  // TYPE HIERARCHY
  // ==========================================================================

  getTypeHierarchy(nodeId: string, direction: 'up' | 'down' | 'both' = 'both'): Node[] {
    const visited = new Set<string>([nodeId]);
    const frontier = [nodeId];
    const result: Node[] = [];

    while (frontier.length > 0) {
      const current = frontier.shift()!;
      let rows: { id: string }[] = [];

      if (direction === 'up' || direction === 'both') {
        const up = this.db.all<{ id: string }>(
          `SELECT target as id FROM edges WHERE source = ? AND kind IN ('extends', 'implements')`,
          [current]
        );
        rows = rows.concat(up);
      }
      if (direction === 'down' || direction === 'both') {
        const down = this.db.all<{ id: string }>(
          `SELECT source as id FROM edges WHERE target = ? AND kind IN ('extends', 'implements')`,
          [current]
        );
        rows = rows.concat(down);
      }

      for (const row of rows) {
        if (!visited.has(row.id)) {
          visited.add(row.id);
          frontier.push(row.id);
          const node = this.getNode(row.id);
          if (node) result.push(node);
        }
      }
    }

    return result;
  }

  // ==========================================================================
  // DEAD CODE
  // ==========================================================================

  findDeadCode(limit = 50): Node[] {
    const rows = this.db.all<RawNode>(
      `SELECT * FROM nodes
       WHERE kind IN ('function', 'method', 'class')
       AND is_exported = 0
       AND id NOT IN (SELECT DISTINCT target FROM edges WHERE kind IN ('calls', 'extends', 'implements', 'imports'))
       LIMIT ?`,
      [limit]
    );
    return rows.map(this.rowToNode);
  }

  // ==========================================================================
  // CIRCULAR DEPENDENCIES
  // ==========================================================================

  findCircularDependencies(): string[][] {
    const rows = this.db.all<{ src: string; dst: string }>(
      `SELECT DISTINCT n1.file_path as src, n2.file_path as dst
       FROM edges e
       JOIN nodes n1 ON n1.id = e.source
       JOIN nodes n2 ON n2.id = e.target
       WHERE e.kind = 'imports' AND n1.file_path != n2.file_path`
    );

    const adj = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!adj.has(row.src)) adj.set(row.src, new Set());
      adj.get(row.src)!.add(row.dst);
    }

    const cycles: string[][] = [];

    for (const start of adj.keys()) {
      this.dfsCycles(start, adj, new Set(), [], cycles, 0);
    }

    // Deduplicate cycles (same set of files in different order)
    const seen = new Set<string>();
    const unique: string[][] = [];
    for (const c of cycles) {
      const key = [...c].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    return unique;
  }

  private dfsCycles(
    node: string,
    adj: Map<string, Set<string>>,
    pathSet: Set<string>,
    pathArr: string[],
    cycles: string[][],
    depth: number
  ): void {
    if (depth > 50) return;
    if (pathSet.has(node)) {
      const startIdx = pathArr.indexOf(node);
      cycles.push([...pathArr.slice(startIdx)]);
      return;
    }

    pathSet.add(node);
    pathArr.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      this.dfsCycles(neighbor, adj, pathSet, pathArr, cycles, depth + 1);
    }

    pathArr.pop();
    pathSet.delete(node);
  }

  // ==========================================================================
  // UNRESOLVED REFERENCES
  // ==========================================================================

  insertUnresolvedRef(
    sourceId: string,
    refName: string,
    refKind: string,
    filePath: string,
    line?: number,
    column?: number
  ): void {
    this.db.run(
      `INSERT INTO unresolved_refs (source_id, ref_name, ref_kind, file_path, line, column)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sourceId, refName, refKind, filePath, line ?? null, column ?? null]
    );
  }

  deleteUnresolvedRefsByFile(filePath: string): void {
    this.db.run('DELETE FROM unresolved_refs WHERE file_path = ?', [filePath]);
  }

  getUnresolvedRefs(): Array<{
    id: number;
    source_id: string;
    ref_name: string;
    ref_kind: string;
    file_path: string;
    line: number | null;
    column: number | null;
  }> {
    return this.db.all(
      'SELECT id, source_id, ref_name, ref_kind, file_path, line, column FROM unresolved_refs'
    );
  }

  deleteUnresolvedRef(id: number): void {
    this.db.run('DELETE FROM unresolved_refs WHERE id = ?', [id]);
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getAllNodes(): Node[] {
    const rows = this.db.all<RawNode>('SELECT * FROM nodes');
    return rows.map(this.rowToNode);
  }

  getStats(): GraphStats {
    const files = this.db.get<{ c: number }>('SELECT COUNT(*) as c FROM files')!.c;
    const nodes = this.db.get<{ c: number }>('SELECT COUNT(*) as c FROM nodes')!.c;
    const edges = this.db.get<{ c: number }>('SELECT COUNT(*) as c FROM edges')!.c;

    const kindRows = this.db.all<{ kind: string; c: number }>('SELECT kind, COUNT(*) as c FROM nodes GROUP BY kind');
    const nodesByKind: Record<string, number> = {};
    for (const row of kindRows) nodesByKind[row.kind] = row.c;

    const langRows = this.db.all<{ language: string; c: number }>('SELECT language, COUNT(*) as c FROM files GROUP BY language');
    const filesByLanguage: Record<string, number> = {};
    for (const row of langRows) filesByLanguage[row.language] = row.c;

    return { files, nodes, edges, nodesByKind, filesByLanguage, dbSizeBytes: 0 };
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  upsertEmbedding(nodeId: string, embedding: Float32Array): void {
    try {
      this.db.run(
        'INSERT OR REPLACE INTO node_embeddings (node_id, embedding) VALUES (?, ?)',
        [nodeId, embedding]
      );
    } catch {
      // vec0 table may not exist in old schemas
    }
  }

  deleteEmbeddingsByNodeIds(nodeIds: string[]): void {
    if (nodeIds.length === 0) return;
    const placeholders = nodeIds.map(() => '?').join(',');
    try {
      this.db.run(
        `DELETE FROM node_embeddings WHERE node_id IN (${placeholders})`,
        nodeIds
      );
    } catch {
      // vec0 table may not exist in old schemas
    }
  }

  deleteEmbeddingsByFile(filePath: string): void {
    const ids = this.db.all<{ id: string }>('SELECT id FROM nodes WHERE file_path = ?', [filePath]);
    if (ids.length === 0) return;
    this.deleteEmbeddingsByNodeIds(ids.map((r) => r.id));
  }

  searchNodesSemantic(queryEmbedding: Float32Array, opts: SearchOptions = {}): Array<{ node: Node; distance: number }> {
    const { kinds, languages, limit = 20 } = opts;
    const safeLimit = Math.max(1, Math.floor(Number(limit)));

    const conditions: string[] = [];
    const params: unknown[] = [queryEmbedding, safeLimit];

    if (kinds && kinds.length > 0) {
      conditions.push(`n.kind IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
    if (languages && languages.length > 0) {
      conditions.push(`n.language IN (${languages.map(() => '?').join(',')})`);
      params.push(...languages);
    }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `SELECT n.*, e.distance
      FROM node_embeddings e
      JOIN nodes n ON n.id = e.node_id
      WHERE e.embedding MATCH ? AND e.k = ?
      ${where}
      ORDER BY e.distance ASC`;

    try {
      const rows = this.db.all<RawNode & { distance: number }>(sql, params);
      return rows.map((row) => ({ node: this.rowToNode(row), distance: row.distance }));
    } catch {
      return [];
    }
  }

  clear(): void {
    this.db.exec('DELETE FROM edges');
    this.db.exec('DELETE FROM nodes');
    this.db.exec('DELETE FROM files');
    this.db.exec('DELETE FROM unresolved_refs');
    try {
      this.db.exec('DELETE FROM node_embeddings');
    } catch {
      // vec0 table may not exist in old schemas
    }
  }

  // ==========================================================================
  // ROW MAPPERS
  // ==========================================================================

  private rowToNode(row: RawNode): Node {
    return {
      id: row.id,
      kind: row.kind as NodeKind,
      name: row.name,
      qualifiedName: row.qualified_name ?? undefined,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      startColumn: row.start_column ?? undefined,
      endColumn: row.end_column ?? undefined,
      language: row.language as Language,
      signature: row.signature ?? undefined,
      docstring: row.docstring ?? undefined,
      isExported: row.is_exported === 1,
      isAsync: row.is_async === 1,
      isStatic: row.is_static === 1,
      isAbstract: row.is_abstract === 1,
      updatedAt: row.updated_at,
    };
  }

  private rowToEdge(row: RawEdge): Edge {
    return {
      source: row.source,
      target: row.target,
      kind: row.kind as EdgeKind,
      line: row.line ?? undefined,
      column: row.column ?? undefined,
    };
  }

  private rowToFile(row: RawFile): FileRecord {
    return {
      path: row.path,
      contentHash: row.content_hash,
      language: row.language,
      lastIndexed: row.last_indexed,
      nodeCount: row.node_count,
    };
  }
}

// ============================================================================
// RAW ROW TYPES
// ============================================================================

interface RawNode {
  id: string;
  kind: string;
  name: string;
  qualified_name: string | null;
  file_path: string;
  start_line: number;
  end_line: number;
  start_column: number | null;
  end_column: number | null;
  language: string;
  signature: string | null;
  docstring: string | null;
  is_exported: number;
  is_async: number;
  is_static: number;
  is_abstract: number;
  updated_at: number;
}

interface RawEdge {
  source: string;
  target: string;
  kind: string;
  line: number | null;
  column: number | null;
}

interface RawFile {
  path: string;
  content_hash: string;
  language: string;
  last_indexed: number;
  node_count: number;
}
