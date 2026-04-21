/**
 * Core type definitions for KimiGraph.
 * Based on proven schema from CodeGraph, simplified for our scope.
 */

// ============================================================================
// NODE KINDS
// ============================================================================

export type NodeKind =
  | 'file'
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'constant'
  | 'property'
  | 'enum'
  | 'enum_member'
  | 'import'
  | 'export';

// ============================================================================
// EDGE KINDS
// ============================================================================

export type EdgeKind =
  | 'contains'
  | 'calls'
  | 'imports'
  | 'exports'
  | 'extends'
  | 'implements'
  | 'references'
  | 'returns'
  | 'type_of';

// ============================================================================
// LANGUAGES
// ============================================================================

export type Language = 'typescript' | 'javascript' | 'python';

export const LANGUAGE_EXTENSIONS: Record<Language, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py'],
};

export function detectLanguage(filePath: string): Language | null {
  const lower = filePath.toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    for (const ext of exts) {
      if (lower.endsWith(ext)) {
        return lang as Language;
      }
    }
  }
  return null;
}

export function isLanguageSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

// ============================================================================
// CORE NODE
// ============================================================================

export interface Node {
  /** Unique ID: "func:src/auth.ts:validateToken:45" */
  id: string;
  kind: NodeKind;
  name: string;
  /** Full qualified name: "AuthService.validateToken" */
  qualifiedName?: string;
  /** Relative path from project root */
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  language: Language;
  /** Function signature: "(token: string): Promise<User>" */
  signature?: string;
  /** Extracted documentation */
  docstring?: string;
  isExported?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  isAbstract?: boolean;
  updatedAt: number;
}

// ============================================================================
// CORE EDGE
// ============================================================================

export interface Edge {
  source: string; // node id
  target: string; // node id
  kind: EdgeKind;
  line?: number;
  column?: number;
}

// ============================================================================
// FILE RECORD
// ============================================================================

export interface FileRecord {
  path: string;
  contentHash: string;
  language: string;
  lastIndexed: number;
  nodeCount: number;
}

// ============================================================================
// EXTRACTION
// ============================================================================

export interface ExtractionError {
  filePath: string;
  line?: number;
  message: string;
}

export interface ExtractionResult {
  nodes: Node[];
  edges: Edge[];
  errors: ExtractionError[];
}

// ============================================================================
// SEARCH
// ============================================================================

export interface SearchOptions {
  kinds?: NodeKind[];
  languages?: Language[];
  limit?: number;
}

export interface SearchResult {
  node: Node;
  score: number; // relevance score
}

// ============================================================================
// GRAPH TRAVERSAL
// ============================================================================

export interface TraversalOptions {
  maxDepth?: number;
  maxNodes?: number;
  edgeKinds?: EdgeKind[];
  nodeKinds?: NodeKind[];
  direction?: 'outbound' | 'inbound' | 'both';
}

export interface Subgraph {
  nodes: Node[];
  edges: Edge[];
  entryPoints: string[];
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export interface TaskContext {
  /** Human-readable summary of what was found */
  summary: string;
  /** Primary entry point nodes */
  entryPoints: Node[];
  /** Related nodes discovered via graph expansion */
  relatedNodes: Node[];
  /** Map of node id -> source code */
  codeSnippets: Map<string, string>;
}

export interface BuildContextOptions {
  maxNodes?: number;
  includeCode?: boolean;
}

// ============================================================================
// INDEXING
// ============================================================================

export interface IndexProgress {
  phase: 'scanning' | 'parsing' | 'resolving';
  current: number;
  total: number;
  currentFile?: string;
}

export interface IndexResult {
  success: boolean;
  filesIndexed: number;
  filesSkipped: number;
  filesErrored: number;
  nodesCreated: number;
  edgesCreated: number;
  errors: ExtractionError[];
  durationMs: number;
}

export interface SyncResult {
  filesChecked: number;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  nodesUpdated: number;
  durationMs: number;
}

// ============================================================================
// STATS
// ============================================================================

export interface GraphStats {
  files: number;
  nodes: number;
  edges: number;
  nodesByKind: Record<string, number>;
  filesByLanguage: Record<string, number>;
  dbSizeBytes: number;
}

// ============================================================================
// CONFIG
// ============================================================================

export interface KimiGraphConfig {
  version: number;
  languages: Language[];
  exclude: string[];
  maxFileSize: number;
  extractDocstrings: boolean;
  trackCallSites: boolean;
}

export const DEFAULT_CONFIG: KimiGraphConfig = {
  version: 1,
  languages: ['typescript', 'javascript', 'python'],
  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '*.min.js',
    '*.bundle.js',
    '__pycache__/**',
    '.venv/**',
    '.tox/**',
    'coverage/**',
    '*.log',
  ],
  maxFileSize: 1024 * 1024, // 1MB
  extractDocstrings: true,
  trackCallSites: true,
};
