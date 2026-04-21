# KimiGraph Agent Instructions

This project has KimiGraph initialized (`.kimigraph/` exists).

## When Exploring This Codebase

1. **Use `kimigraph_context` as your PRIMARY tool** for understanding code. It returns entry points, related symbols, and key code — often enough to answer without additional tool calls.

2. **Use `kimigraph_search`** for quick symbol lookups when you know the name.

3. **Use `kimigraph_impact`** before making changes to understand what code would be affected.

4. **Use `kimigraph_callers` / `kimigraph_callees`** when tracing execution flow.

5. **Only fall back to grep/read** for files not in the graph or for runtime/configuration files.

## Key Architecture

- **Database layer**: `src/db/` — SQLite + FTS5. All queries go through `QueryBuilder`.
- **Extraction layer**: `src/extraction/` — tree-sitter AST → nodes + edges.
- **Graph layer**: `src/graph/` — BFS traversal, impact radius, path finding.
- **Context layer**: `src/context/` — builds task-relevant context from natural language.
- **MCP layer**: `src/mcp/` — JSON-RPC stdio server with 7 tools.
- **Resolution layer**: `src/resolution/` — links unresolved calls to definitions.

## Common Tasks

- **Add a new query method**: Edit `src/db/queries.ts`, add test in `__tests__/db-smoke.test.ts`.
- **Add a new MCP tool**: Edit `src/mcp/tools.ts` (schema + handler).
- **Fix extraction**: Edit the `.scm` query file for the language, test with `__tests__/extraction.test.ts`.
- **Fix resolution**: Edit `src/resolution/index.ts`, add strategy to `resolveCall()`.
