/**
 * MCP Tool definitions and handlers for KimiGraph.
 */

import { KimiGraph } from '../index';


const MAX_OUTPUT = 15000;

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n...[truncated]' : s;
}

function clampLimit(value: number | undefined, defaultValue: number): number {
  const n = typeof value === 'number' ? value : defaultValue;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function mapKind(kind: string): string {
  if (kind === 'type_alias') return 'type';
  return kind;
}

function mapLanguageToFence(language: string): string {
  const map: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    python: 'python',
    go: 'go',
    rust: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    csharp: 'csharp',
  };
  return map[language] ?? '';
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const tools: ToolDefinition[] = [
  {
    name: 'kimigraph_search',
    description: 'Quick symbol search by name. Returns locations only (no code). Use kimigraph_context for comprehensive task context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Symbol name or partial name' },
        kind: { type: 'string', description: 'Filter by node kind', enum: ['function', 'method', 'class', 'interface', 'type_alias', 'variable'] },
        limit: { type: 'number', description: 'Max results 1-100 (default: 10)', default: 10 },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'kimigraph_context',
    description: 'PRIMARY TOOL: Build comprehensive context for a task or feature request. Returns entry points, related symbols, and key code — often enough to understand the codebase without additional tool calls.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Description of the task, bug, or feature' },
        maxNodes: { type: 'number', description: 'Max symbols to include (default: 20)', default: 20 },
        includeCode: { type: 'boolean', description: 'Include code snippets (default: true)', default: true },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['task'],
    },
  },
  {
    name: 'kimigraph_callers',
    description: 'Find all functions/methods that call a specific symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find callers for' },
        limit: { type: 'number', description: 'Max results 1-100 (default: 20)', default: 20 },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'kimigraph_callees',
    description: 'Find all functions/methods that a specific symbol calls.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find callees for' },
        limit: { type: 'number', description: 'Max results 1-100 (default: 20)', default: 20 },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'kimigraph_impact',
    description: 'Analyze what code would be affected by changing a symbol. Use before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to analyze impact for' },
        depth: { type: 'number', description: 'Traversal depth (default: 2)', default: 2 },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'kimigraph_node',
    description: 'Get details about a specific symbol, optionally including its source code.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to look up' },
        includeCode: { type: 'boolean', description: 'Include source code (default: false)', default: false },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'kimigraph_status',
    description: 'Check index health and statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
    },
  },
  {
    name: 'kimigraph_dead_code',
    description: 'Find potentially dead code — unexported functions, methods, and classes that are never called or referenced.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results 1-100 (default: 20)', default: 20 },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
    },
  },
  {
    name: 'kimigraph_cycles',
    description: 'Find circular dependencies in the import graph. Returns import cycles as lists of file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
    },
  },
  {
    name: 'kimigraph_path',
    description: 'Find the shortest path between two symbols through the call/import graph. Shows how code flows from A to B.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Starting symbol name' },
        to: { type: 'string', description: 'Target symbol name' },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'kimigraph_explore',
    description: 'PRIMARY EXPLORATION TOOL: Answer broad codebase questions by returning full source sections for all relevant symbols in ONE call. Use this INSTEAD of reading individual files when exploring architecture, tracing flows, or understanding how a feature works. Returns complete code snippets with file paths and line ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language question or topic to explore, e.g. "How does authentication work?" or "Trace the request flow"' },
        budget: { type: 'string', description: 'Context budget: small (~10 symbols), medium (~20 symbols), large (~40 symbols). Use small for targeted questions, large for broad architecture questions.', enum: ['small', 'medium', 'large'], default: 'medium' },
        projectPath: { type: 'string', description: 'Project root path (optional)' },
      },
      required: ['query'],
    },
  },
];

const MAX_CONNECTIONS = 10;

export class ToolHandler {
  private defaultKg: KimiGraph | null;
  private connections = new Map<string, KimiGraph>();
  private lastAccessed = new Map<string, number>();

  constructor(kg: KimiGraph | null) {
    this.defaultKg = kg;
  }

  setDefaultKimiGraph(kg: KimiGraph): void {
    this.defaultKg = kg;
  }

  closeAll(): void {
    for (const kg of this.connections.values()) {
      try { kg.close(); } catch { /* ignore */ }
    }
    this.connections.clear();
    this.lastAccessed.clear();
  }

  private evictOldestIfNeeded(): void {
    if (this.connections.size < MAX_CONNECTIONS) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, time] of this.lastAccessed) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const kg = this.connections.get(oldestKey);
      if (kg) {
        try { kg.close(); } catch { /* ignore */ }
      }
      this.connections.delete(oldestKey);
      this.lastAccessed.delete(oldestKey);
    }
  }

  private async getConnection(projectPath?: string): Promise<KimiGraph | null> {
    if (!projectPath) return this.defaultKg;
    const resolved = require('path').resolve(projectPath);
    if (this.connections.has(resolved)) {
      this.lastAccessed.set(resolved, Date.now());
      return this.connections.get(resolved)!;
    }
    try {
      this.evictOldestIfNeeded();
      const kg = await KimiGraph.open(resolved);
      kg.watch();
      this.connections.set(resolved, kg);
      this.lastAccessed.set(resolved, Date.now());
      return kg;
    } catch {
      return null;
    }
  }

  async handle(toolName: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const text = await this.dispatch(toolName, args);
      return { content: [{ type: 'text', text: truncate(text) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }

  private async dispatch(toolName: string, args: Record<string, unknown>): Promise<string> {
    const kg = await this.getConnection(args.projectPath as string | undefined);
    if (!kg) return 'KimiGraph not initialized. Run `kimigraph init` in your project first.';

    // Auto-sync if dirty before serving any query (ensures fresh graph)
    if (kg.isDirty()) {
      await kg.syncIfDirty();
    }

    switch (toolName) {
      case 'kimigraph_search': {
        const limit = clampLimit(args.limit as number | undefined, 10);
        const results = await kg.searchNodes(args.query as string, { limit });
        if (results.length === 0) return `No symbols found matching "${args.query}".`;
        return results.map((r) =>
          `${mapKind(r.node.kind)} ${r.node.name}\n  File: ${r.node.filePath}:${r.node.startLine}`
        ).join('\n\n');
      }

      case 'kimigraph_context': {
        const ctx = await kg.buildContext(args.task as string, {
          maxNodes: (args.maxNodes as number) ?? 20,
          includeCode: (args.includeCode as boolean) ?? true,
        });
        const lines: string[] = [ctx.summary, ''];
        if (ctx.entryPoints.length === 0) {
          lines.push('No matching symbols found.');
        } else {
          lines.push('### Entry Points');
          for (const n of ctx.entryPoints) {
            lines.push(`- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`);
            if (ctx.codeSnippets.has(n.id)) {
              lines.push('```', ctx.codeSnippets.get(n.id)!, '```');
            }
          }
          if (ctx.relatedNodes.length > 0) {
            lines.push('', '### Related Symbols');
            for (const n of ctx.relatedNodes.slice(0, 10)) {
              lines.push(`- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`);
            }
          }
        }
        return lines.join('\n');
      }

      case 'kimigraph_callers': {
        const limit = clampLimit(args.limit as number | undefined, 20);
        const results = await kg.searchNodes(args.symbol as string, { limit: 5 });
        if (results.length === 0) return `Symbol "${args.symbol}" not found.`;
        const node = results[0].node;
        const callers = kg.getCallers(node.id, limit);
        if (callers.length === 0) return `No callers found for \`${node.name}\`.`;
        return `Callers of \`${node.name}\`:\n` + callers.map((n) =>
          `- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`
        ).join('\n');
      }

      case 'kimigraph_callees': {
        const limit = clampLimit(args.limit as number | undefined, 20);
        const results = await kg.searchNodes(args.symbol as string, { limit: 5 });
        if (results.length === 0) return `Symbol "${args.symbol}" not found.`;
        const node = results[0].node;
        const callees = kg.getCallees(node.id, limit);
        if (callees.length === 0) return `\`${node.name}\` doesn't call any indexed symbols.`;
        return `\`${node.name}\` calls:\n` + callees.map((n) =>
          `- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`
        ).join('\n');
      }

      case 'kimigraph_impact': {
        const results = await kg.searchNodes(args.symbol as string, { limit: 5 });
        if (results.length === 0) return `Symbol "${args.symbol}" not found.`;
        const node = results[0].node;
        const affected = kg.getImpactRadius(node.id, (args.depth as number) ?? 2);
        if (affected.length === 0) return `No dependents found for \`${node.name}\`.`;
        return `Changing \`${node.name}\` may affect ${affected.length} symbol(s):\n` +
          affected.map((n) => `- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`).join('\n');
      }

      case 'kimigraph_node': {
        const results = await kg.searchNodes(args.symbol as string, { limit: 5 });
        if (results.length === 0) return `Symbol "${args.symbol}" not found.`;
        const node = results[0].node;
        const lines = [
          `${mapKind(node.kind)} \`${node.name}\``,
          `File: ${node.filePath}:${node.startLine}-${node.endLine}`,
          node.qualifiedName ? `Qualified: ${node.qualifiedName}` : '',
          node.signature ? `Signature: ${node.signature}` : '',
          node.docstring ? `Docs: ${node.docstring}` : '',
        ].filter(Boolean);
        if (args.includeCode) {
          const src = kg.getNodeSource(node);
          if (src) lines.push('', '```', src, '```');
        }
        return lines.join('\n');
      }

      case 'kimigraph_status': {
        const stats = kg.getStats();
        const langLine = Object.entries(stats.filesByLanguage)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const dbMb = (stats.dbSizeBytes / 1024 / 1024).toFixed(2);
        return [
          `KimiGraph Status`,
          `  Project: ${kg.getProjectRoot()}`,
          `  Files indexed: ${stats.files}`,
          `  Symbols: ${stats.nodes}`,
          `  Relationships: ${stats.edges}`,
          `  By kind: ${Object.entries(stats.nodesByKind).map(([k, v]) => `${k}=${v}`).join(', ')}`,
          langLine ? `  By language: ${langLine}` : '',
          `  DB size: ${dbMb} MB`,
        ].filter(Boolean).join('\n');
      }

      case 'kimigraph_dead_code': {
        const limit = clampLimit(args.limit as number | undefined, 20);
        const dead = kg.findDeadCode(limit);
        if (dead.length === 0) return 'No dead code found. All symbols are either exported or referenced.';
        return `Potentially dead code (${dead.length} symbols):\n` + dead.map((n) =>
          `- ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`
        ).join('\n');
      }

      case 'kimigraph_cycles': {
        const cycles = kg.findCircularDependencies();
        if (cycles.length === 0) return 'No circular dependencies found.';
        return `Found ${cycles.length} import cycle(s):\n\n` + cycles.map((cycle, i) =>
          `Cycle ${i + 1}:\n` + cycle.map((f) => `  → ${f}`).join('\n')
        ).join('\n\n');
      }

      case 'kimigraph_path': {
        const fromResults = await kg.searchNodes(args.from as string, { limit: 5 });
        const toResults = await kg.searchNodes(args.to as string, { limit: 5 });
        if (fromResults.length === 0) return `Symbol "${args.from}" not found.`;
        if (toResults.length === 0) return `Symbol "${args.to}" not found.`;
        const fromNode = fromResults[0].node;
        const toNode = toResults[0].node;
        const pathResult = kg.findPath(fromNode.id, toNode.id);
        if (pathResult.nodes.length === 0) {
          return `No path found from \`${fromNode.name}\` to \`${toNode.name}\` within the graph.`;
        }
        const lines = [`Path from \`${fromNode.name}\` to \`${toNode.name}\` (${pathResult.nodes.length} hops):`];
        for (let i = 0; i < pathResult.nodes.length; i++) {
          const n = pathResult.nodes[i];
          lines.push(`${i + 1}. ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}`);
          if (i < pathResult.edges.length) {
            const e = pathResult.edges[i];
            lines.push(`   → ${e.kind}`);
          }
        }
        return lines.join('\n');
      }

      case 'kimigraph_explore': {
        const budget = (args.budget as string) ?? 'medium';
        const maxNodes = budget === 'small' ? 5 : budget === 'large' ? 30 : 15;
        const ctx = await kg.buildContext(args.query as string, {
          maxNodes,
          includeCode: true,
        });

        if (ctx.entryPoints.length === 0) {
          return `No relevant symbols found for "${args.query}". Try a more specific query or check if the project is indexed.`;
        }

        const lines: string[] = [];
        lines.push(`## Exploration: ${args.query}`);
        lines.push('');
        lines.push(`Budget: ${budget} | Symbols: ${ctx.entryPoints.length + ctx.relatedNodes.length}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        // Relationship map: show how entry points connect via calls/imports
        const epSet = new Set(ctx.entryPoints.map((n) => n.id));
        const relSet = new Set(ctx.relatedNodes.map((n) => n.id));
        const connSeen = new Set<string>();
        const connections: Array<{ from: string; to: string; kind: string }> = [];

        for (const ep of ctx.entryPoints) {
          const callees = kg.getCallees(ep.id, 10);
          for (const c of callees) {
            if (!epSet.has(c.id) && !relSet.has(c.id)) continue;
            // Normalize direction to avoid duplicates (A→B and B←A)
            const key = `${ep.name}|calls|${c.name}`;
            const reverseKey = `${c.name}|calls|${ep.name}`;
            if (!connSeen.has(key) && !connSeen.has(reverseKey)) {
              connSeen.add(key);
              connections.push({ from: ep.name, to: c.name, kind: 'calls' });
            }
          }
        }

        if (connections.length > 0) {
          lines.push('### Relationship Map');
          lines.push('');
          for (const conn of connections) {
            lines.push(`- \`${conn.from}\` **${conn.kind}** \`${conn.to}\``);
          }
          lines.push('');
        }

        // Entry points with full source
        lines.push(`### Entry Points (${ctx.entryPoints.length})`);
        lines.push('');
        for (const n of ctx.entryPoints) {
          lines.push(`#### ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}-${n.endLine}`);
          if (n.signature) lines.push(`*Signature:* \`${n.signature}\``);
          if (n.docstring) lines.push(`*Docs:* ${n.docstring}`);
          const code = ctx.codeSnippets.get(n.id);
          if (code) {
            lines.push('');
            const fence = mapLanguageToFence(n.language);
            lines.push(fence ? `\`\`\`${fence}` : '```');
            lines.push(code);
            lines.push('```');
          }
          lines.push('');
        }

        // Related symbols with full source
        if (ctx.relatedNodes.length > 0) {
          lines.push(`### Related Symbols (${ctx.relatedNodes.length})`);
          lines.push('');
          for (const n of ctx.relatedNodes) {
            lines.push(`#### ${mapKind(n.kind)} \`${n.name}\` — ${n.filePath}:${n.startLine}-${n.endLine}`);
            const code = ctx.codeSnippets.get(n.id);
            if (code) {
              lines.push('');
              const fence = mapLanguageToFence(n.language);
              lines.push(fence ? `\`\`\`${fence}` : '```');
              lines.push(code);
              lines.push('```');
            }
            lines.push('');
          }
        }

        lines.push('---');
        lines.push('');
        lines.push(`*End of exploration for "${args.query}"*`);

        return lines.join('\n');
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  }
}
