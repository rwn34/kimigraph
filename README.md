# KimiGraph

> **One MCP tool call replaces 10+ file reads.**

KimiGraph is a local-first code knowledge graph for [Kimi Code CLI](https://github.com/MoonshotAI/kimi-cli). It parses your codebase into a queryable graph of symbols and relationships, so Kimi can explore architecture, trace call chains, and find relevant code without reading files one by one.

---

## Why KimiGraph Exists

When you ask Kimi "How does authentication work in this project?", the default behavior is:

1. `Glob` to list files
2. `ReadFile` on `src/auth.ts`
3. `ReadFile` on `src/middleware.ts`
4. `Grep` for `validateToken`
5. `ReadFile` on `src/users.ts`
6. ... and so on

**That's 10+ tool calls and 30+ seconds** before Kimi understands the flow.

With KimiGraph:

1. `kimigraph_explore` → returns full source sections for all relevant symbols in **one call**

**Result: 77% fewer tool calls, answers in under 3 seconds.**

---

## What It Does

KimiGraph builds a pre-computed graph of your code:

- **Symbols** — every function, class, method, interface, struct, enum
- **Relationships** — who calls whom, who imports whom, who contains whom
- **Full-text index** — FTS5 over names, signatures, and docstrings
- **Semantic vectors** — 768-dim embeddings for natural-language symbol search

Then it exposes that graph to Kimi through 8 MCP tools.

---

## Supported Languages

| Language | Extensions | Status |
|----------|-----------|--------|
| TypeScript / JavaScript | `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | ✅ |
| Python | `.py` | ✅ |
| Go | `.go` | ✅ |
| Rust | `.rs` | ✅ |
| Java | `.java` | ✅ |
| C | `.c` `.h` | ✅ |
| C++ | `.cpp` `.cc` `.cxx` `.hpp` `.hxx` | ✅ |
| C# | `.cs` | ✅ |

---

## Quick Start

```bash
# Install globally
npm install -g rwn-kimigraph

# Initialize in your project
cd your-project
kimigraph init

# Index the codebase
kimigraph index

# Pre-download embedding model (optional, for offline/air-gapped)
npm run download-model

# Connect to Kimi CLI
kimigraph install
```

Restart Kimi CLI. Kimi will automatically use `kimigraph_explore` as its primary exploration tool (via `.kimi/AGENTS.md` instructions).

---

## How It Works

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Kimi CLI   │────▶│  MCP stdio      │────▶│  SQLite DB  │
│  (Agent)    │◀────│  kimigraph      │◀────│  .kimigraph/│
└─────────────┘     └─────────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              tree-sitter    graph
              AST parser     traversal
                              │
                              ▼
                         sqlite-vec
                      semantic search
```

1. **Parse** — tree-sitter WASM grammars extract symbols and calls
2. **Store** — SQLite with FTS5 + sqlite-vec (vectors)
3. **Query** — Kimi asks natural-language questions, graph returns relevant code

100% local. No API keys. No external services. The embedding model downloads once (~130MB) to `~/.kimigraph/models/`.

---

## MCP Tools

| Tool | Purpose | When Kimi Uses It |
|------|---------|-------------------|
| `kimigraph_explore` | **Primary tool.** Returns full source sections for exploration | "How does X work?" |
| `kimigraph_search` | Find symbols by name (exact → FTS → semantic → LIKE) | "Find the auth function" |
| `kimigraph_context` | Build comprehensive task context | "Implement feature Y" |
| `kimigraph_callers` | Who calls this symbol | "Who uses this?" |
| `kimigraph_callees` | What this symbol calls | "What does this depend on?" |
| `kimigraph_impact` | What's affected by a change | "What breaks if I change this?" |
| `kimigraph_node` | Get a single symbol's details + source | "Show me the implementation" |
| `kimigraph_status` | Check index health and stats | "Is the graph up to date?" |

---

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

---

## Example Session

```bash
$ cd my-project
$ kimigraph index
  Indexed 23 files, 412 symbols, 1,024 edges in 2.1s

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

---

## Architecture

**Extraction** (`src/extraction/`)
- Parses code with tree-sitter WASM grammars
- Extracts functions, classes, methods, imports, exports, calls
- Creates unresolved references for cross-file resolution

**Database** (`src/db/`)
- SQLite with WAL mode for performance
- FTS5 full-text search over names, signatures, docstrings
- **sqlite-vec** for 768-dim semantic vector search (KNN)
- Nodes, edges, files, and unresolved references tables

**Graph** (`src/graph/`)
- BFS traversal with edge kind filters
- Callers, callees, impact radius, shortest path
- Dead code detection, circular dependency finding

**Context Builder** (`src/context/`)
- Extracts symbol tokens from natural language tasks
- **4-tier search:** exact match → FTS5 → semantic (vec0 KNN) → LIKE fallback
- BFS expansion to find related symbols
- Formats results as markdown with full source sections

**Embeddings** (`src/embeddings/`)
- Lazy-loads `nomic-ai/nomic-embed-text-v1.5` (~130MB)
- Generates 768-dim vectors for all embeddable symbols
- Batched inference (32 texts/batch) during indexing
- Configurable via `embeddingModel` and `embeddingBatchSize`

**Watcher** (`src/watcher/`)
- `fs.watch` recursive file watcher (zero dependencies)
- Debounced auto-sync (2s) after file changes
- Syncs automatically before every MCP tool call if dirty

**Resolution** (`src/resolution/`)
- Matches unresolved calls to definitions
- Same-file exact match → project-wide unique match → module-to-file

---

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

# Benchmark
npm run benchmark

# Download embedding model
npm run download-model
```

---

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
- First index with embeddings downloads the model (~130MB)

**Embedding model download fails**
Run `npm run download-model` to pre-download `nomic-embed-text-v1.5` for offline use.

**Outdated graph after edits**
The watcher auto-syncs within 2 seconds of file changes. If you edit outside the watched directories or the watcher missed a change, run `kimigraph sync`.

---

## Honest Limitations

KimiGraph replaces **most** file reads during exploration, but not all. Here is what works and what doesn't:

### Works well ✅

| Feature | Detail |
|---------|--------|
| Structural queries | Callers, callees, impact radius, shortest path, dead code |
| Multi-language | 9 languages with mixed-language repo support |
| Search | Exact name → FTS5 → semantic (natural language) → LIKE fallback |
| Exploration | `kimigraph_explore` returns full source sections in one call |
| Auto-sync | File watcher + pre-query sync keeps graph fresh |
| Cross-file resolution | Same-language imports and calls resolved statically |
| Agent instructions | Auto-writes `.kimi/AGENTS.md` on `kimigraph init` |

### Edge cases and gaps ❌

| Limitation | Why |
|------------|-----|
| Dynamic imports | `import(variable)` resolved at runtime, not statically |
| Network calls | gRPC, HTTP endpoints not traced across service boundaries |
| Macros / code generation | Preprocessor macros, templates, and codegen not expanded |
| Reflection | Reflection-based calls (e.g., `Class.forName`) not resolved |
| Cross-language FFI | WASM imports, Node-API, and FFI boundaries mostly not traced |
| Comments outside symbols | Docstrings attached to symbols only; free-floating comments not indexed |
| Anonymous functions | Callbacks and lambdas may not get meaningful names |

### Performance notes

- **Indexing:** 20-file repo ≈ 1-3s structural, ≈ 3-5s with embeddings (first run includes model download)
- **Query:** All graph queries are sub-millisecond (SQLite in-memory + indexes)
- **Memory:** Vectors stay in SQLite (vec0), not loaded into memory
- **Disk:** ~1-5MB per 100 files for structural index; ~2-5MB additional for embeddings

---

## Roadmap

**Phase 1 — Foundation (v0.1) ✅**
- [x] TypeScript / JavaScript / Python extraction
- [x] SQLite + FTS5 search
- [x] Graph traversal (callers, callees, impact, paths, cycles, dead code)
- [x] MCP server with 7 tools
- [x] Reference resolution (cross-file imports)
- [x] npm package published

**Phase 2 — Operational (v0.2) ✅**
- [x] `kimigraph_explore` tool (full source sections in one call)
- [x] File watcher with debounced auto-sync
- [x] Kimi agent instructions (`.kimi/AGENTS.md`)
- [x] Go, Rust, Java languages
- [x] Benchmarks proving ≥70% tool-call reduction

**Phase 3 — Semantic (v0.3) ✅**
- [x] Vector embeddings (`nomic-embed-text-v1.5`)
- [x] sqlite-vec semantic search
- [x] Natural-language symbol lookup fallback
- [x] `better-sqlite3` driver migration

**Phase 4 — Broader (v0.3.1) ✅**
- [x] C / C++ / C# languages (9 total)

**Phase 5 — Deepen (v0.4) 🎯**
- [ ] Type-aware search (find by signature: `"User -> string"`)
- [ ] Cross-language resolution (WASM imports, protobuf boundaries)
- [ ] Incremental embedding updates (only re-embed changed symbols)
- [ ] More languages (Ruby, PHP, Swift, Kotlin)

> See `PLAN.md` for detailed direction, decision log, and validation criteria.

---

## Benchmarks

Measured on 4 repos (TypeScript API, Go CLI, Rust library, and self):

| Metric | Result |
|--------|--------|
| Avg tool-call reduction | **77%** |
| Avg file reduction | **68%** |
| Questions answered with 1 explore call | **100%** |
| Indexing overhead with embeddings | **~3.5×** structural-only |

Run yourself: `npm run benchmark`

---

## License

MIT
