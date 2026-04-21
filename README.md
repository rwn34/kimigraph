# rwn-KimiGraph

Local-first semantic code knowledge graph for [Kimi Code CLI](https://github.com/MoonshotAI/kimi-cli).

**One MCP tool call replaces 10+ file reads.** KimiGraph parses your codebase into an AST, extracts symbols and relationships, and stores them in a local SQLite database. Kimi queries the graph instantly instead of scanning files.

## Quick Start

```bash
# Install globally
npm install -g rwn-kimigraph

# Initialize in your project
cd your-project
kimigraph init

# Index the codebase
kimigraph index

# Connect to Kimi CLI
kimigraph install
```

Restart Kimi CLI. Kimi will now use `kimigraph_context` as its primary exploration tool.

## Supported Languages

- TypeScript / JavaScript
- Python

More languages coming in future releases.

## How It Works

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Kimi CLI   │────▶│  MCP stdio      │────▶│  SQLite DB  │
│             │◀────│  kimigraph      │◀────│  .kimigraph/│
└─────────────┘     └─────────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              tree-sitter    graph
              AST parser     traversal
```

100% local. No API keys. No external services.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `kimigraph init [path]` | Initialize `.kimigraph/` in a project |
| `kimigraph index [path]` | Full re-index of the codebase |
| `kimigraph sync [path]` | Incremental sync of changed files |
| `kimigraph status [path]` | Show index statistics |
| `kimigraph query <search>` | Search symbols by name |
| `kimigraph callers <symbol>` | Find who calls a symbol |
| `kimigraph callees <symbol>` | Find what a symbol calls |
| `kimigraph impact <symbol>` | Find affected code before changing |
| `kimigraph context <task>` | Build context for a task (testing) |
| `kimigraph serve --mcp` | Start MCP server |
| `kimigraph install` | Add to `~/.kimi/mcp.json` |
| `kimigraph uninstall` | Remove from `~/.kimi/mcp.json` |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `kimigraph_search` | Find symbols by name |
| `kimigraph_context` | Build comprehensive task context |
| `kimigraph_callers` | Who calls this symbol |
| `kimigraph_callees` | What this symbol calls |
| `kimigraph_impact` | What's affected by a change |
| `kimigraph_node` | Get symbol details |
| `kimigraph_status` | Check index health |

## Example Session

```bash
$ cd my-project
$ kimigraph index
  23/23 files
Indexed 23 files, 412 symbols, 1,024 edges

$ kimigraph query "validate"
function validateToken — src/auth.ts:45
function validateEmail — src/users.ts:12
method validate — src/forms.ts:88

$ kimigraph callers validateToken
Callers of function validateToken (src/auth.ts:45):
  function login — src/auth.ts:120
  function refresh — src/auth.ts:156
  method authenticate — src/services/auth.ts:34

$ kimigraph impact validateToken
Impact radius of function validateToken (src/auth.ts:45):
  function login — src/auth.ts:120
  function refresh — src/auth.ts:156
  method authenticate — src/services/auth.ts:34
  class AuthService — src/services/auth.ts:8
```

## Architecture

**Extraction** (`src/extraction/`)
- Parses code with tree-sitter WASM grammars
- Extracts functions, classes, methods, imports, exports
- Creates unresolved references for cross-file resolution

**Database** (`src/db/`)
- SQLite with FTS5 full-text search
- Nodes table: every symbol with location, kind, signature
- Edges table: calls, imports, contains relationships
- Files table: hash-based incremental sync

**Graph** (`src/graph/`)
- BFS traversal with edge kind filters
- Callers, callees, impact radius, shortest path
- Dead code detection, circular dependency finding

**Context Builder** (`src/context/`)
- Extracts symbol tokens from natural language tasks
- FTS + exact search for entry points
- BFS expansion to find related symbols
- Formats results as markdown for Kimi

**Resolution** (`src/resolution/`)
- Matches unresolved calls to definitions
- Same-file exact match → project-wide unique match → module-to-file

## Development

```bash
# Clone
git clone https://github.com/rwn34/kimigraph.git
cd kimigraph

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Test
npm test

# Dev mode (watch)
npm run dev
```

## Troubleshooting

**"KimiGraph not initialized"**
Run `kimigraph init` in your project root first.

**"Grammar WASM not found"**
Make sure `tree-sitter-wasms` is installed: `npm install tree-sitter-wasms`

**MCP tools not appearing in Kimi**
1. Run `kimigraph install`
2. Restart Kimi CLI completely
3. Check `~/.kimi/mcp.json` contains the `kimigraph` server

**Slow indexing**
- Large files (>1MB) are skipped automatically
- Minified files are excluded by default
- Use `kimigraph sync` instead of `kimigraph index` for incremental updates

## Roadmap

- [x] TypeScript / JavaScript / Python extraction
- [x] SQLite + FTS5 search
- [x] Graph traversal (callers, callees, impact)
- [x] MCP server with 7 tools
- [x] Reference resolution (basic)
- [ ] More languages (Go, Rust, Java)
- [ ] Vector embeddings for semantic search
- [ ] Architecture analysis (packages, layers, coupling)
- [ ] File watcher for auto-sync

## License

MIT
