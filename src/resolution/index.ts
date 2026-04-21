/**
 * Reference resolver for KimiGraph.
 * Links unresolved call edges and import edges to actual node definitions.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Node, UnresolvedRef } from '../types';
import { QueryBuilder } from '../db/queries';
import { logInfo } from '../errors';

export interface ResolutionResult {
  resolved: number;
  total: number;
  details: Array<{
    ref: UnresolvedRef;
    targetId: string | null;
    strategy: string;
  }>;
}

export class ReferenceResolver {
  private queries: QueryBuilder;
  private projectRoot: string;

  constructor(queries: QueryBuilder, projectRoot: string) {
    this.queries = queries;
    this.projectRoot = projectRoot;
  }

  resolve(): ResolutionResult {
    const unresolved = this.queries.getUnresolvedRefs();
    const allNodes = this.queries.getAllNodes();

    // Build indexes
    const nodesByName = new Map<string, Node[]>();
    const nodesByFile = new Map<string, Node[]>();
    const nodesById = new Map<string, Node>();

    for (const node of allNodes) {
      nodesById.set(node.id, node);

      if (!nodesByName.has(node.name)) nodesByName.set(node.name, []);
      nodesByName.get(node.name)!.push(node);

      if (!nodesByFile.has(node.filePath)) nodesByFile.set(node.filePath, []);
      nodesByFile.get(node.filePath)!.push(node);
    }

    let resolved = 0;
    const details: ResolutionResult['details'] = [];

    for (const rawRef of unresolved) {
      const ref: UnresolvedRef = {
        sourceId: rawRef.source_id,
        refName: rawRef.ref_name,
        refKind: rawRef.ref_kind,
        filePath: rawRef.file_path,
        line: rawRef.line ?? undefined,
        column: rawRef.column ?? undefined,
      };

      let targetId: string | null = null;
      let strategy = 'none';

      if (ref.refKind === 'module') {
        const result = this.resolveModule(ref, nodesByFile);
        targetId = result.targetId;
        strategy = result.strategy;
      } else {
        const result = this.resolveCall(ref, nodesByName, nodesByFile);
        targetId = result.targetId;
        strategy = result.strategy;
      }

      if (targetId) {
        const edgeKind = ref.refKind === 'module' ? 'imports' : 'calls';
        this.queries.insertEdge({
          source: ref.sourceId,
          target: targetId,
          kind: edgeKind,
          line: ref.line,
          column: ref.column,
        });
        this.queries.deleteUnresolvedRef(rawRef.id);
        resolved++;
      }

      details.push({ ref, targetId, strategy });
    }

    logInfo(`Resolved ${resolved}/${unresolved.length} references`);
    return { resolved, total: unresolved.length, details };
  }

  private resolveModule(
    ref: UnresolvedRef,
    nodesByFile: Map<string, Node[]>
  ): { targetId: string | null; strategy: string } {
    const modulePath = ref.refName;

    // Skip external modules (no relative path, no path alias)
    if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
      return { targetId: null, strategy: 'skip-external' };
    }

    // Resolve relative path to actual file
    const sourceDir = path.dirname(path.join(this.projectRoot, ref.filePath));
    let resolvedPath: string | null = null;

    const candidates = [
      path.join(sourceDir, modulePath),
      path.join(sourceDir, modulePath + '.ts'),
      path.join(sourceDir, modulePath + '.tsx'),
      path.join(sourceDir, modulePath + '.js'),
      path.join(sourceDir, modulePath + '.jsx'),
      path.join(sourceDir, modulePath, 'index.ts'),
      path.join(sourceDir, modulePath, 'index.tsx'),
      path.join(sourceDir, modulePath, 'index.js'),
      path.join(sourceDir, modulePath, 'index.jsx'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        resolvedPath = path.relative(this.projectRoot, candidate).replace(/\\/g, '/');
        break;
      }
    }

    if (!resolvedPath) {
      return { targetId: null, strategy: 'file-not-found' };
    }

    // Find the file node
    const fileNodes = nodesByFile.get(resolvedPath);
    const fileNode = fileNodes?.find((n) => n.kind === 'file');
    if (fileNode) {
      return { targetId: fileNode.id, strategy: 'module-to-file' };
    }

    return { targetId: null, strategy: 'no-file-node' };
  }

  private resolveCall(
    ref: UnresolvedRef,
    nodesByName: Map<string, Node[]>,
    nodesByFile: Map<string, Node[]>
  ): { targetId: string | null; strategy: string } {
    const name = ref.refName;

    // Strategy 1: Same-file exact match
    const sameFileNodes = nodesByFile.get(ref.filePath) ?? [];
    const sameFileMatch = sameFileNodes.find(
      (n) => n.name === name && ['function', 'method', 'class', 'variable'].includes(n.kind)
    );
    if (sameFileMatch) {
      return { targetId: sameFileMatch.id, strategy: 'same-file-exact' };
    }

    // Strategy 2: Same-file case-insensitive match
    const sameFileCiMatch = sameFileNodes.find(
      (n) => n.name.toLowerCase() === name.toLowerCase() && ['function', 'method', 'class', 'variable'].includes(n.kind)
    );
    if (sameFileCiMatch) {
      return { targetId: sameFileCiMatch.id, strategy: 'same-file-ci' };
    }

    // Strategy 3: Project-wide unique match (only if exactly one definition exists)
    const allWithName = nodesByName.get(name) ?? [];
    const definitions = allWithName.filter(
      (n) => ['function', 'method', 'class', 'variable'].includes(n.kind)
    );
    if (definitions.length === 1) {
      return { targetId: definitions[0].id, strategy: 'project-unique' };
    }

    // Strategy 4: Project-wide case-insensitive unique match
    const ciDefinitions = allWithName.filter(
      (n) => n.name.toLowerCase() === name.toLowerCase() && ['function', 'method', 'class', 'variable'].includes(n.kind)
    );
    if (ciDefinitions.length === 1) {
      return { targetId: ciDefinitions[0].id, strategy: 'project-unique-ci' };
    }

    return { targetId: null, strategy: 'unresolved' };
  }
}
