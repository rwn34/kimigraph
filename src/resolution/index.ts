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

  private importMapCache = new Map<string, Map<string, string>>();

  private buildImportMap(filePath: string): Map<string, string> {
    if (this.importMapCache.has(filePath)) {
      return this.importMapCache.get(filePath)!;
    }

    const map = new Map<string, string>();
    const absPath = path.join(this.projectRoot, filePath);
    let source: string;
    try {
      source = fs.readFileSync(absPath, 'utf8');
    } catch {
      this.importMapCache.set(filePath, map);
      return map;
    }

    // Named imports: import { foo, bar } from './module'
    const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = namedImportRegex.exec(source)) !== null) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
      const moduleSource = m[2];
      for (const n of names) {
        if (n) map.set(n, moduleSource);
      }
    }

    // Default imports: import foo from './module'
    const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = defaultImportRegex.exec(source)) !== null) {
      map.set(m[1], m[2]);
    }

    // Namespace imports: import * as foo from './module'
    const namespaceImportRegex = /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = namespaceImportRegex.exec(source)) !== null) {
      map.set(m[1], m[2]);
    }

    this.importMapCache.set(filePath, map);
    return map;
  }

  private resolveModuleToFile(moduleSource: string, fromFile: string): string | null {
    if (!moduleSource.startsWith('.') && !moduleSource.startsWith('/')) {
      return null; // external module
    }
    const sourceDir = path.dirname(path.join(this.projectRoot, fromFile));
    const candidates = [
      path.join(sourceDir, moduleSource),
      path.join(sourceDir, moduleSource + '.ts'),
      path.join(sourceDir, moduleSource + '.tsx'),
      path.join(sourceDir, moduleSource + '.js'),
      path.join(sourceDir, moduleSource + '.jsx'),
      path.join(sourceDir, moduleSource, 'index.ts'),
      path.join(sourceDir, moduleSource, 'index.tsx'),
      path.join(sourceDir, moduleSource, 'index.js'),
      path.join(sourceDir, moduleSource, 'index.jsx'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return path.relative(this.projectRoot, candidate).replace(/\\/g, '/');
      }
    }
    return null;
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

    // Strategy 2.5: Import-aware resolution
    const importMap = this.buildImportMap(ref.filePath);
    const moduleSource = importMap.get(name);
    if (moduleSource) {
      const resolvedFile = this.resolveModuleToFile(moduleSource, ref.filePath);
      if (resolvedFile) {
        const fileNodes = nodesByFile.get(resolvedFile) ?? [];
        const match = fileNodes.find(
          (n) => n.name === name && ['function', 'method', 'class', 'variable'].includes(n.kind)
        );
        if (match) {
          return { targetId: match.id, strategy: 'import-aware' };
        }
      }
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
