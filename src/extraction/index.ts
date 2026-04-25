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

  // Protobuf files — regex-based extraction (no tree-sitter grammar needed)
  if (lowerPath.endsWith('.proto')) {
    return extractProto(filePath, source);
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

    // Group by unique definition node, merging all capture names for the same node.
    // This handles cases where a single syntax node matches multiple definition
    // patterns (e.g., a class_declaration captured as both class.definition and
    // implements.definition).
    const nodeDefMap = new Map<number, Map<string, SyntaxNode[]>>();

    for (const def of defs) {
      if (!nodeDefMap.has(def.node.id)) {
        nodeDefMap.set(def.node.id, new Map());
      }
      const group = nodeDefMap.get(def.node.id)!;
      if (!group.has(def.name)) group.set(def.name, []);
      group.get(def.name)!.push(def.node);
    }

    // Assign each 'other' capture to its innermost containing definition node.
    // This ensures calls inside anonymous functions are attributed to the
    // anonymous function, not the outer named function.
    for (const other of others) {
      let innermostDefNode: SyntaxNode | null = null;
      for (const def of defs) {
        if (other.node.id === def.node.id || this.isDescendant(other.node, def.node)) {
          if (!innermostDefNode || (def.node.id !== innermostDefNode.id && this.isDescendant(def.node, innermostDefNode))) {
            innermostDefNode = def.node;
          }
        }
      }

      if (innermostDefNode) {
        const group = nodeDefMap.get(innermostDefNode.id)!;
        if (!group.has(other.name)) group.set(other.name, []);
        group.get(other.name)!.push(other.node);
      } else {
        this.processStandalone(other);
      }
    }

    // Process each unique definition node group
    for (const group of nodeDefMap.values()) {
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
    // Function declarations (skip if also a method — method takes precedence)
    if (group.has('function.definition') && !group.has('method.definition')) {
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

    // Extends edges
    if (group.has('extends.definition')) {
      const defNode = group.get('extends.definition')![0];
      const parentNodes = group.get('extends.name') ?? [];
      for (const parentNode of parentNodes) {
        this.addInheritanceEdge(defNode, parentNode, 'extends');
      }
    }

    // Implements edges
    if (group.has('implements.definition')) {
      const defNode = group.get('implements.definition')![0];
      const interfaceNodes = group.get('implements.name') ?? [];
      for (const ifaceNode of interfaceNodes) {
        this.addInheritanceEdge(defNode, ifaceNode, 'implements');
      }
    }

    // Enum definitions
    if (group.has('enum.definition')) {
      const defNode = group.get('enum.definition')![0];
      const nameNode = group.get('enum.name')?.[0];
      if (nameNode) {
        this.addEnum(nameNode, defNode);
      }
    }

    // Enum member definitions
    if (group.has('enum_member.definition')) {
      const memberNodes = group.get('enum_member.definition') ?? [];
      const nameNodes = group.get('enum_member.name') ?? [];
      for (let i = 0; i < memberNodes.length; i++) {
        if (nameNodes[i]) {
          this.addEnumMember(nameNodes[i], memberNodes[i]);
        }
      }
    }

    // Property definitions
    if (group.has('property.definition')) {
      const propNodes = group.get('property.definition') ?? [];
      const nameNodes = group.get('property.name') ?? [];
      for (let i = 0; i < propNodes.length; i++) {
        if (nameNodes[i]) {
          this.addProperty(nameNodes[i], propNodes[i]);
        }
      }
    }

    // Constant definitions
    if (group.has('constant.definition')) {
      const constNodes = group.get('constant.definition') ?? [];
      const nameNodes = group.get('constant.name') ?? [];
      for (let i = 0; i < constNodes.length; i++) {
        if (nameNodes[i]) {
          this.addConstant(nameNodes[i], constNodes[i]);
        }
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
      signature: this.extractSignature(defNode),
      isExported: this.isNodeExported(defNode, name),
      isAsync: this.hasChildOfType(defNode, 'async'),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addMethod(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const className = this.getEnclosingClassName(defNode);
    const qualifiedName = className ? `${className}.${name}` : name;
    const id = this.makeId('method', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'method',
      name,
      qualifiedName,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      docstring: this.extractDocstring(defNode),
      signature: this.extractSignature(defNode),
      isExported: this.isNodeExported(defNode, name),
      isAsync: this.hasChildOfType(defNode, 'async'),
      isStatic: this.hasChildOfType(defNode, 'static'),
      isAbstract: this.hasChildOfType(defNode, 'abstract') || defNode.type === 'abstract_method_signature',
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
      isExported: this.isNodeExported(defNode, name),
      isAbstract: this.hasChildOfType(defNode, 'abstract'),
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
      isExported: this.isNodeExported(defNode, name),
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

  private addEnum(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('enum', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'enum',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      isExported: this.isNodeExported(defNode, name),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addEnumMember(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('enum_member', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'enum_member',
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

  private addProperty(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('property', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'property',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      isExported: this.isNodeExported(defNode, name),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addConstant(nameNode: SyntaxNode, defNode: SyntaxNode): void {
    const name = nameNode.text;
    const id = this.makeId('constant', name, nameNode.startPosition.row + 1);
    const node: Node = {
      id,
      kind: 'constant',
      name,
      filePath: this.filePath,
      startLine: defNode.startPosition.row + 1,
      endLine: defNode.endPosition.row + 1,
      startColumn: defNode.startPosition.column,
      endColumn: defNode.endPosition.column,
      language: this.language,
      isExported: this.isNodeExported(defNode, name),
      updatedAt: Date.now(),
    };
    this.addNode(node);
    this.addEdge(this.fileNodeId, id, 'contains');
  }

  private addInheritanceEdge(defNode: SyntaxNode, parentNode: SyntaxNode, kind: EdgeKind): void {
    // Find the class/interface node that corresponds to defNode
    let sourceId: string | null = null;
    for (const [id, node] of this.nodeMap) {
      if (node.startLine === defNode.startPosition.row + 1 &&
          node.startColumn === defNode.startPosition.column) {
        sourceId = id;
        break;
      }
    }
    if (!sourceId) return;

    // Find target by name in current file (same-file resolution)
    const targetName = parentNode.text;
    for (const [id, node] of this.nodeMap) {
      if ((node.kind === 'class' || node.kind === 'interface' || node.kind === 'enum') &&
          node.name === targetName) {
        this.addEdge(sourceId, id, kind);
        return;
      }
    }

    // Parent not found locally — queue for cross-file resolution
    this.unresolvedRefs.push({
      sourceId,
      refName: targetName,
      refKind: kind, // 'extends' or 'implements'
      filePath: this.filePath,
      line: parentNode.startPosition.row + 1,
      column: parentNode.startPosition.column,
    });
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

  private extractSignature(node: SyntaxNode): string | undefined {
    const paramTypes = ['formal_parameters', 'parameter_list', 'parameters'];
    let params: string | undefined;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && paramTypes.includes(child.type)) {
        params = child.text;
        break;
      }
    }
    if (!params) return undefined;

    // Try to extract return type from common AST patterns
    const returnType = this.extractReturnType(node);
    if (returnType) {
      return `${params} -> ${returnType}`;
    }
    return params;
  }

  private extractReturnType(node: SyntaxNode): string | undefined {
    // Language-specific return type extraction
    const returnTypePatterns: string[] = [];

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      // TypeScript/JS: type_annotation (return type, not parameter type)
      if (child.type === 'type_annotation') {
        // Strip leading ': ' to normalize
        const cleaned = child.text.replace(/^:\s*/, '').trim();
        if (cleaned) returnTypePatterns.push(cleaned);
      }
      // Python: type (after ->)
      if (this.language === 'python' && child.type === 'type') {
        returnTypePatterns.push(child.text);
      }
      // Go: type (after params)
      if (this.language === 'go' && child.type === 'type') {
        returnTypePatterns.push(child.text);
      }
      // Rust: return_type
      if (child.type === 'return_type') {
        returnTypePatterns.push(child.text);
      }
      // Java/C#/C/C++: type identifier before name, but return type after params is usually in modifiers/type
      if (['java', 'csharp', 'c', 'cpp'].includes(this.language) && child.type === 'type') {
        returnTypePatterns.push(child.text);
      }
    }

    // For languages where return type precedes the name (Java, C#, C, C++, Go),
    // it's already visible in the declaration; skip to avoid duplication
    if (['java', 'csharp', 'c', 'cpp'].includes(this.language)) {
      return undefined;
    }

    return returnTypePatterns[0] ?? undefined;
  }

  private extractDocstring(node: SyntaxNode): string | undefined {
    const startLine = node.startPosition.row; // 0-based
    const lines = this.source.split('\n');

    // Strategy 1 (Python only): body docstring takes priority over preceding comments.
    if (this.language === 'python') {
      const bodyDocstring = this.extractPythonDocstring(node);
      if (bodyDocstring) return bodyDocstring;
    }

    // Strategy 2: Collect consecutive line comments immediately before the definition.
    // Covers: JS/TS //, Go //, Rust ///, Java //, C# //, C/C++ //, Python #
    const commentLines: string[] = [];
    let currentLine = startLine - 1;

    while (currentLine >= 0) {
      const rawLine = lines[currentLine];
      const trimmed = rawLine.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        commentLines.unshift(rawLine);
        currentLine--;
        continue;
      }

      // Block comment end: look backward for /*
      if (trimmed.endsWith('*/')) {
        const blockLines: string[] = [];
        let blockStart = currentLine;
        while (blockStart >= 0) {
          blockLines.unshift(lines[blockStart]);
          if (lines[blockStart].trim().startsWith('/*')) {
            break;
          }
          blockStart--;
        }
        if (blockLines.length > 0 && blockLines[0].trim().startsWith('/*')) {
          return this.cleanBlockComment(blockLines.join('\n'));
        }
        break;
      }

      // Empty line or non-comment code stops the scan
      if (trimmed === '' || !trimmed.startsWith('//')) {
        break;
      }
      break;
    }

    if (commentLines.length > 0) {
      return this.cleanLineComments(commentLines);
    }

    return undefined;
  }

  private extractPythonDocstring(node: SyntaxNode): string | undefined {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'block') {
        const firstStmt = child.child(0);
        if (firstStmt && firstStmt.type === 'expression_statement') {
          const expr = firstStmt.child(0);
          if (expr && expr.type === 'string') {
            return this.cleanPythonDocstring(expr.text);
          }
        }
        // Some grammar versions place string directly under block
        const first = child.child(0);
        if (first && first.type === 'string') {
          return this.cleanPythonDocstring(first.text);
        }
      }
    }
    return undefined;
  }

  private cleanLineComments(lines: string[]): string {
    return lines
      .map((line) => {
        const trimmed = line.trim();
        return trimmed.replace(/^\/\/+\s?|^#\s?/, '').trim();
      })
      .join('\n');
  }

  private cleanBlockComment(text: string): string {
    return text
      .replace(/\/\*\*?\s*/, '') // remove opening /* or /**
      .replace(/\s*\*\/$/, '')   // remove closing */
      .split('\n')
      .map((line) => line.trim().replace(/^\*\s?/, '').trim()) // remove leading *
      .join('\n')
      .trim();
  }

  private cleanPythonDocstring(text: string): string {
    return text
      .replace(/^[furbFURB]?("""|''')/, '') // remove opening quotes (with optional prefix)
      .replace(/("""|''')$/, '')            // remove closing quotes
      .trim();
  }

  private hasChildOfType(node: SyntaxNode, type: string): boolean {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === type) return true;
    }
    return false;
  }

  private isNodeExported(node: SyntaxNode, name: string): boolean {
    // TypeScript / JavaScript: wrapped in export_statement
    let current: SyntaxNode | null = node;
    while (current) {
      if (current.type === 'export_statement') return true;
      current = current.parent;
    }

    // Rust: visibility_modifier child with 'pub'
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'visibility_modifier' && child.text === 'pub') return true;
    }

    // Java / C#: modifiers child containing public/protected
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'modifiers' || child.type === 'modifier')) {
        const text = child.text;
        if (text === 'public' || text === 'protected') return true;
      }
    }

    // Go: capitalized name
    if (this.language === 'go' && name.length > 0 && name[0] === name[0].toUpperCase()) {
      return true;
    }

    // Python: no leading underscore (public by convention)
    if (this.language === 'python' && !name.startsWith('_')) {
      return true;
    }

    // Ruby: methods are public by default; no reliable static visibility analysis
    if (this.language === 'ruby') {
      return true;
    }

    // PHP: check visibility_modifier child for public/protected
    if (this.language === 'php') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'visibility_modifier') {
          const text = child.text;
          if (text === 'public' || text === 'protected') return true;
        }
      }
    }

    // Swift: public/open modifiers indicate exported API
    if (this.language === 'swift') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && (child.type === 'modifiers' || child.type === 'modifier')) {
          const text = child.text;
          if (text === 'public' || text === 'open') return true;
        }
      }
    }

    // Kotlin: public/protected/internal modifiers (default is public)
    if (this.language === 'kotlin') {
      let hasModifier = false;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && (child.type === 'modifiers' || child.type === 'modifier')) {
          hasModifier = true;
          const text = child.text;
          if (text === 'public' || text === 'protected' || text === 'internal') return true;
        }
      }
      // No visibility modifier = public by default in Kotlin
      if (!hasModifier) return true;
    }

    return false;
  }

  private getEnclosingClassName(node: SyntaxNode): string | null {
    const classTypes = [
      'class_declaration', 'class_definition', 'struct_item', 'class_specifier',
      'struct_specifier', 'enum_declaration', 'enum_item', 'class',
      'struct_declaration', 'object_declaration', 'module',
    ];
    const interfaceTypes = [
      'interface_declaration', 'trait_item', 'interface_definition', 'interface_specifier',
      'protocol_declaration',
    ];
    let current: SyntaxNode | null = node;
    while (current) {
      if (classTypes.includes(current.type) || interfaceTypes.includes(current.type)) {
        for (let i = 0; i < current.childCount; i++) {
          const child = current.child(i);
          if (child && (child.type === 'identifier' || child.type === 'type_identifier')) {
            return child.text;
          }
        }
      }
      current = current.parent;
    }
    return null;
  }
}

// ============================================================================
// PROTOBUF EXTRACTION (regex-based, no tree-sitter grammar needed)
// ============================================================================

function extractProto(filePath: string, source: string): ExtractionResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const fileNodeId = `file:${filePath}`;
  const lines = source.split('\n');

  nodes.push({
    id: fileNodeId,
    kind: 'file',
    name: path.basename(filePath),
    filePath,
    startLine: 1,
    endLine: lines.length,
    language: 'protobuf' as Language,
    updatedAt: Date.now(),
  });

  // message MessageName { ... }
  const messageRegex = /message\s+(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = messageRegex.exec(source)) !== null) {
    const name = m[1];
    const line = source.slice(0, m.index).split('\n').length;
    const id = `class:${filePath}:${name}:${line}`;
    nodes.push({
      id,
      kind: 'class',
      name,
      filePath,
      startLine: line,
      endLine: line,
      language: 'protobuf' as Language,
      isExported: true,
      updatedAt: Date.now(),
    });
    edges.push({ source: fileNodeId, target: id, kind: 'contains' as EdgeKind });
  }

  // enum EnumName { ... }
  const enumRegex = /enum\s+(\w+)\s*\{/g;
  while ((m = enumRegex.exec(source)) !== null) {
    const name = m[1];
    const line = source.slice(0, m.index).split('\n').length;
    const id = `enum:${filePath}:${name}:${line}`;
    nodes.push({
      id,
      kind: 'enum',
      name,
      filePath,
      startLine: line,
      endLine: line,
      language: 'protobuf' as Language,
      isExported: true,
      updatedAt: Date.now(),
    });
    edges.push({ source: fileNodeId, target: id, kind: 'contains' as EdgeKind });
  }

  // service ServiceName { rpc MethodName(Request) returns (Response); }
  const serviceRegex = /service\s+(\w+)\s*\{/g;
  while ((m = serviceRegex.exec(source)) !== null) {
    const serviceName = m[1];
    const serviceLine = source.slice(0, m.index).split('\n').length;
    const serviceId = `class:${filePath}:${serviceName}:${serviceLine}`;
    nodes.push({
      id: serviceId,
      kind: 'class',
      name: serviceName,
      filePath,
      startLine: serviceLine,
      endLine: serviceLine,
      language: 'protobuf' as Language,
      isExported: true,
      updatedAt: Date.now(),
    });
    edges.push({ source: fileNodeId, target: serviceId, kind: 'contains' as EdgeKind });

    // Find RPC methods inside this service block
    const blockStart = m.index + m[0].length;
    let braceDepth = 1;
    let blockEnd = blockStart;
    for (let i = blockStart; i < source.length && braceDepth > 0; i++) {
      if (source[i] === '{') braceDepth++;
      if (source[i] === '}') braceDepth--;
      if (braceDepth > 0) blockEnd = i;
    }
    const serviceBody = source.slice(blockStart, blockEnd + 1);

    const rpcRegex = /rpc\s+(\w+)\s*\(\s*(\w+)\s*\)\s+returns\s*\(\s*(\w+)\s*\)/g;
    let rpcM: RegExpExecArray | null;
    while ((rpcM = rpcRegex.exec(serviceBody)) !== null) {
      const rpcName = rpcM[1];
      const reqType = rpcM[2];
      const respType = rpcM[3];
      const rpcLine = serviceLine + serviceBody.slice(0, rpcM.index).split('\n').length;
      const rpcId = `method:${filePath}:${rpcName}:${rpcLine}`;
      nodes.push({
        id: rpcId,
        kind: 'method',
        name: rpcName,
        filePath,
        startLine: rpcLine,
        endLine: rpcLine,
        language: 'protobuf' as Language,
        signature: `(${reqType}) -> ${respType}`,
        isExported: true,
        updatedAt: Date.now(),
      });
      edges.push({ source: serviceId, target: rpcId, kind: 'contains' as EdgeKind });
      // Reference edges to request/response message types (if indexed)
      edges.push({ source: rpcId, target: reqType, kind: 'calls' as EdgeKind });
      edges.push({ source: rpcId, target: respType, kind: 'calls' as EdgeKind });
    }
  }

  return { nodes, edges, unresolvedRefs: [], errors: [] };
}
