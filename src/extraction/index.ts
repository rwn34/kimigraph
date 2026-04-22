/**
 * Extraction orchestrator for KimiGraph.
 * Parses source code with tree-sitter and extracts nodes + edges.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Parser } from 'web-tree-sitter';

// web-tree-sitter doesn't export SyntaxNode type directly
type SyntaxNode = ReturnType<Parser['parse']> extends infer T ? T extends { rootNode: infer N } ? N : never : never;
import {
  Node,
  Edge,
  EdgeKind,
  Language,
  ExtractionResult,
  ExtractionError,
  UnresolvedRef,
  detectLanguage,
} from '../types';
import { loadGrammar, loadQuery } from './grammar';
import { logError } from '../errors';

function getQueriesDir(): string {
  const candidates = [
    path.join(__dirname, 'queries'),
    path.join(__dirname, '..', 'extraction', 'queries'),
    path.join(__dirname, '..', '..', 'src', 'extraction', 'queries'),
    path.join(process.cwd(), 'src', 'extraction', 'queries'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

// ============================================================================
// MAIN EXTRACTION ENTRY POINT
// ============================================================================

export async function extractFromSource(
  filePath: string,
  source: string,
  language?: Language
): Promise<ExtractionResult> {
  const lang = language ?? detectLanguage(filePath);
  if (!lang) {
    return {
      nodes: [],
      edges: [],
      unresolvedRefs: [],
      errors: [{ filePath, message: 'Unsupported language' }],
    };
  }

  // FFI binaries — create file node only, no parsing
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.node') || lowerPath.endsWith('.wasm')) {
    const fileNodeId = `file:${filePath}`;
    const fileNode: Node = {
      id: fileNodeId,
      kind: 'file',
      name: path.basename(filePath),
      filePath,
      startLine: 1,
      endLine: 1,
      language: 'javascript',
      updatedAt: Date.now(),
    };
    return {
      nodes: [fileNode],
      edges: [],
      unresolvedRefs: [],
      errors: [],
    };
  }

  try {
    const grammar = await loadGrammar(lang);
    const parser = new Parser();
    parser.setLanguage(grammar);

    const tree = parser.parse(source);
    if (!tree) {
      return {
        nodes: [],
        edges: [],
        unresolvedRefs: [],
        errors: [{ filePath, message: 'Failed to parse source' }],
      };
    }
    const queryFile = path.join(getQueriesDir(), `${lang}.scm`);

    if (!fs.existsSync(queryFile)) {
      return {
        nodes: [],
        edges: [],
        unresolvedRefs: [],
        errors: [{ filePath, message: `No query file for language: ${lang}` }],
      };
    }

    const query = loadQuery(grammar, queryFile);
    const captures = query.captures(tree.rootNode);

    const extractor = new Extractor(filePath, source, lang);
    extractor.processCaptures(captures);

    parser.delete();
    query.delete();
    tree.delete();

    return {
      nodes: extractor.nodes,
      edges: extractor.edges,
      unresolvedRefs: extractor.unresolvedRefs,
      errors: extractor.errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Extraction failed for ${filePath}:`, message);
    return {
      nodes: [],
      edges: [],
      unresolvedRefs: [],
      errors: [{ filePath, message }],
    };
  }
}

// ============================================================================
// EXTRACTOR CLASS
// ============================================================================

class Extractor {
  nodes: Node[] = [];
  edges: Edge[] = [];
  unresolvedRefs: UnresolvedRef[] = [];
  errors: ExtractionError[] = [];
  private filePath: string;
  private source: string;
  private language: Language;
  private nodeMap = new Map<string, Node>();
  private fileNodeId: string;

  constructor(filePath: string, source: string, language: Language) {
    this.filePath = filePath;
    this.source = source;
    this.language = language;
    this.fileNodeId = `file:${filePath}`;

    const lines = source.split('\n');
    const fileNode: Node = {
      id: this.fileNodeId,
      kind: 'file',
      name: path.basename(filePath),
      filePath,
      startLine: 1,
      endLine: lines.length,
      language,
      updatedAt: Date.now(),
    };
    this.addNode(fileNode);
  }

  processCaptures(captures: Array<{ name: string; node: SyntaxNode }>): void {
    // Find all definition captures first
    const defs: Array<{ name: string; node: SyntaxNode }> = [];
    const others: Array<{ name: string; node: SyntaxNode }> = [];

    for (const cap of captures) {
      if (cap.name.endsWith('.definition') || cap.name.endsWith('.declaration') || cap.name.endsWith('.statement') || cap.name.endsWith('.assignment')) {
        defs.push(cap);
      } else {
        others.push(cap);
      }
    }

    // Assign each 'other' capture to its innermost containing definition.
    // This ensures calls inside anonymous functions are attributed to the
    // anonymous function, not the outer named function.
    const groups = new Map<number, Map<string, SyntaxNode[]>>();

    for (const other of others) {
      let innermostIdx = -1;
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        if (other.node.id === def.node.id || this.isDescendant(other.node, def.node)) {
          if (innermostIdx === -1 || this.isDescendant(def.node, defs[innermostIdx].node)) {
            innermostIdx = i;
          }
        }
      }

      if (innermostIdx >= 0) {
        if (!groups.has(innermostIdx)) {
          groups.set(innermostIdx, new Map());
        }
        const group = groups.get(innermostIdx)!;
        if (!group.has(other.name)) group.set(other.name, []);
        group.get(other.name)!.push(other.node);
      } else {
        this.processStandalone(other);
      }
    }

    // Process each definition with its assigned group
    for (let i = 0; i < defs.length; i++) {
      const group = groups.get(i) ?? new Map();
      group.set(defs[i].name, [defs[i].node]);
      this.processGroup(group);
    }
  }

  private isDescendant(child: SyntaxNode, ancestor: SyntaxNode): boolean {
    let current: SyntaxNode | null = child;
    while (current) {
      if (current.id === ancestor.id) return true;
      current = current.parent;
    }
    return false;
  }

  private processStandalone(cap: { name: string; node: SyntaxNode }): void {
    if (cap.name === 'call.expression' || cap.name === 'call.function' || cap.name === 'call.method') {
      // Already handled in processGroup if within a definition
      // Standalone calls at module level
      const callNode = cap.node.type === 'call_expression' || cap.node.type === 'call'
        ? cap.node
        : cap.node.parent;
      if (!callNode) return;

      const fnNode = cap.name === 'call.function' ? cap.node : undefined;
      const methodNode = cap.name === 'call.method' ? cap.node : undefined;
      this.addCall(callNode, fnNode, methodNode, undefined);
    } else if (cap.name === 'comment.definition') {
      this.addComment(cap.node);
    }
  }

  private processGroup(group: Map<string, SyntaxNode[]>): void {
    // Function declarations
    if (group.has('function.definition')) {
      const defNode = group.get('function.definition')![0];
      const nameNode = group.get('function.name')?.[0];
      if (nameNode) {
        this.addFunction(nameNode, defNode);
      }
    }

    // Class declarations
    if (group.has('class.definition')) {
      const defNode = group.get('class.definition')![0];
      const nameNode = group.get('class.name')?.[0];
      if (nameNode) {
        this.addClass(nameNode, defNode);
      }
    }

    // Interface declarations
    if (group.has('interface.definition')) {
      const defNode = group.get('interface.definition')![0];
      const nameNode = group.get('interface.name')?.[0];
      if (nameNode) {
        this.addInterface(nameNode, defNode);
      }
    }

    // Type alias declarations
    if (group.has('type.definition')) {
      const defNode = group.get('type.definition')![0];
      const nameNode = group.get('type.name')?.[0];
      if (nameNode) {
        this.addTypeAlias(nameNode, defNode);
      }
    }

    // Method definitions
    if (group.has('method.definition')) {
      const defNode = group.get('method.definition')![0];
      const nameNode = group.get('method.name')?.[0];
      if (nameNode) {
        this.addMethod(nameNode, defNode);
      }
    }

    // Variable declarations
    if (group.has('variable.declaration')) {
      const nameNode = group.get('variable.name')?.[0];
      if (nameNode) {
        this.addVariable(nameNode);
      }
    }

    // Variable assignments (Python)
    if (group.has('variable.assignment')) {
      const nameNode = group.get('variable.name')?.[0];
      if (nameNode) {
        this.addVariable(nameNode);
      }
    }

    // Import statements
    if (group.has('import.statement')) {
      const stmtNode = group.get('import.statement')![0];
      const sourceNode = group.get('import.source')?.[0];
      const importName = group.get('import.name')?.[0];
      const moduleName = group.get('import.module')?.[0];
      this.addImport(stmtNode, sourceNode, importName, moduleName);
    }

    // Export statements
    if (group.has('export.statement')) {
      const stmtNode = group.get('export.statement')![0];
      this.addExport(stmtNode);
    }

    // Comment definitions
    if (group.has('comment.definition')) {
      const commentNodes = group.get('comment.definition') ?? [];
      for (const commentNode of commentNodes) {
        this.addComment(commentNode);
      }
    }

    // Anonymous function definitions
    if (group.has('anonymous.definition')) {
      const anonNodes = group.get('anonymous.definition') ?? [];
      for (const anonNode of anonNodes) {
        this.addAnonymousFunction(anonNode);
      }
    }

    // Call expressions within this definition
    const callExprNodes = group.get('call.expression') ?? [];
    for (const callNode of callExprNodes) {
      const fnNode = group.get('call.function')?.find((n) => this.isDescendant(n, callNode));
      const methodNode = group.get('call.method')?.find((n) => this.isDescendant(n, callNode));
      const objNode = group.get('call.object')?.find((n) => this.isDescendant(n, callNode));
      this.addCall(callNode, fnNode, methodNode, objNode);
    }
  }

  // ==========================================================================
  // NODE BUILDERS
  // ==========================================================================

  private addFunction(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('function', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'function',
      name,
      qualifiedName: name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      docstring: this.extractDocstring(defNode),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addMethod(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('method', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'method',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      docstring: this.extractDocstring(defNode),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addClass(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('class', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'class',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      docstring: this.extractDocstring(defNode),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addInterface(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('interface', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'interface',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addTypeAlias(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('type_alias', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'type_alias',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addVariable(nameNode: SyntaxNode): void {
    const name = nameNode.text;
    // Skip if already a function
    if (this.nodeMap.has(this.makeId('function', name, nameNode.startPosition.row + 1))) {
      return;
    }
    const id = this.makeId('variable', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'variable',
      name,
      filePath: this.filePath,
      startLine: nameNode.startPosition.row + 1,
      endLine: nameNode.endPosition.row + 1,
      startColumn: nameNode.startPosition.column,
      endColumn: nameNode.endPosition.column,
      language: this.language,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addImport(
    stmtNode: SyntaxNode,
    sourceNode?: SyntaxNode,
    importNameNode?: SyntaxNode,
    moduleNameNode?: SyntaxNode
  ): void {
    const source = sourceNode?.text.replace(/['"]/g, '') ?? moduleNameNode?.text ?? 'unknown';
    const name = importNameNode?.text ?? source;
    const id = this.makeId('import', name, stmtNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'import',
      name,
      filePath: this.filePath,
      startLine: stmtNode.startPosition.row + 1,
      endLine: stmtNode.endPosition.row + 1,
      language: this.language,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
    // Detect FFI imports (WASM, Node-API binaries)
    const isFfi = source.endsWith('.node') || source.endsWith('.wasm');
    this.unresolvedRefs.push({
      sourceId: this.fileNodeId,
      refName: source,
      refKind: isFfi ? 'ffi' : 'module',
      filePath: this.filePath,
      line: stmtNode.startPosition.row + 1,
      column: stmtNode.startPosition.column,
    });
  }

  private addExport(stmtNode: SyntaxNode): void {
    const id = this.makeId('export', 'export', stmtNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'export',
      name: 'export',
      filePath: this.filePath,
      startLine: stmtNode.startPosition.row + 1,
      endLine: stmtNode.endPosition.row + 1,
      language: this.language,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addComment(commentNode: SyntaxNode): void {
    const text = commentNode.text;
    const line = commentNode.startPosition.row + 1;
    const preview = text.length > 80 ? text.slice(0, 80) + '...' : text;
    const id = this.makeId('comment', `line_${line}`, line);
    const node: Node = {
      id,
      kind: 'comment',
      name: preview,
      filePath: this.filePath,
      startLine: line,
      endLine: commentNode.endPosition.row + 1,
      startColumn: commentNode.startPosition.column,
      endColumn: commentNode.endPosition.column,
      language: this.language,
      docstring: text,
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addAnonymousFunction(defNode: SyntaxNode): void {
    const line = defNode.startPosition.row + 1;
    const syntheticName = `anonymous_at_line_${line}`;
    const id = this.makeId('function', syntheticName, line);
    const node: Node = {
      id,
      kind: 'function',
      name: syntheticName,
      qualifiedName: syntheticName,
      filePath: this.filePath,
      startLine: line,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      docstring: this.extractDocstring(defNode),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addCall(
    callNode: SyntaxNode,
    fnNode?: SyntaxNode,
    methodNode?: SyntaxNode,
    _objNode?: SyntaxNode
  ): void {
    const targetName = methodNode?.text ?? fnNode?.text ?? 'unknown';
    const line = callNode.startPosition.row + 1;
    const col = callNode.startPosition.column;

    // Detect require('./addon.node') and require('./module.wasm')
    if (targetName === 'require') {
      const match = callNode.text.match(/require\s*\(\s*['"](.+?)['"]\s*\)/);
      if (match) {
        const argText = match[1];
        if (argText.endsWith('.node') || argText.endsWith('.wasm')) {
          this.unresolvedRefs.push({
            sourceId: this.fileNodeId,
            refName: argText,
            refKind: 'ffi',
            filePath: this.filePath,
            line,
            column: col,
          });
          return;
        }
      }
    }

    // Find the nearest containing function/method/class as source
    let sourceId = this.fileNodeId;
    let current: SyntaxNode | null = callNode;
    while (current) {
      const parentId = this.findNodeIdForSyntaxNode(current);
      if (parentId && parentId !== this.fileNodeId) {
        sourceId = parentId;
        break;
      }
      current = current.parent;
    }

    this.unresolvedRefs.push({
      sourceId,
      refName: targetName,
      refKind: 'function',
      filePath: this.filePath,
      line,
      column: col,
    });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private addNode(node: Node): void {
    if (this.nodeMap.has(node.id)) return;
    this.nodeMap.set(node.id, node);
    this.nodes.push(node);
  }

  private addEdge(source: string, target: string, kind: EdgeKind, line?: number, column?: number): void {
    this.edges.push({ source, target, kind, line, column });
  }

  private makeId(kind: string, name: string, line: number): string {
    const safeName = name.replace(/[^a-zA-Z0-9_$]/g, '_');
    return `${kind}:${this.filePath}:${safeName}:${line}`;
  }

  private findNodeIdForSyntaxNode(syntaxNode: SyntaxNode): string | null {
    for (const [id, node] of this.nodeMap) {
      if (
        node.startLine === syntaxNode.startPosition.row + 1 &&
        node.startColumn === syntaxNode.startPosition.column
      ) {
        return id;
      }
    }
    return null;
  }

  private extractDocstring(node: SyntaxNode): string | undefined {
    const startLine = node.startPosition.row;
    const lines = this.source.split('\n');

    if (startLine > 0) {
      const prevLine = lines[startLine - 1].trim();
      if (prevLine.startsWith('//') || prevLine.startsWith('#') || prevLine.startsWith('*')) {
        return prevLine.replace(/^[/*#\s]+/, '').trim();
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'comment' || child.type === 'string')) {
        return child.text.replace(/^['"\s]+|['"\s]+$/g, '').trim();
      }
    }

    return undefined;
  }
}
