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

**Result: fewer tool calls, answers in under 3 seconds.**

---

## What It Does

KimiGraph builds a pre-computed graph of your code:

- **Symbols** — every function, class, method, interface, struct, enum
- **Relationships** — who calls whom, who imports whom, who contains whom
- **Full-text index** — FTS5 over names, signatures, and docstrings
- **Semantic vectors** — 768-dim embeddings for natural-language symbol search

Then it exposes that graph to Kimi through 11 MCP tools.

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

## Installation Requirements

KimiGraph installs via npm. Native dependencies (`better-sqlite3`, `sqlite-vec`) ship prebuilt binaries for common platforms — no compiler toolchain needed in most cases.

| Platform | Requirements | Notes |
|----------|-------------|-------|
| **Linux** (Debian, Ubuntu, etc.) | Node ≥18, `glibc` | Prebuilt binaries available for x64 and arm64. If your architecture lacks a prebuild, install `build-essential python3` for node-gyp fallback. |
| **Windows** | Node ≥18 | Prebuilt binaries available for x64. Works on Windows 10/11 and Server 2019+. |
| **macOS** | Node ≥18 | Prebuilt binaries available for Intel and Apple Silicon. |

**CI verified:** All 9 combinations (Ubuntu / Windows / macOS × Node 18 / 20 / 22) pass tests on every push.

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
| `kimigraph_path` | Shortest path between two symbols | "How does A reach B?" |
| `kimigraph_status` | Check index health and stats | "Is the graph up to date?" |

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `kimigraph init [path]` | Initialize `.kimigraph/` in a project |
| `kimigraph index [path]` | Full re-index of the codebase |
| `kimigraph sync [path]` | Incremental sync of changed files |
| `kimigraph watch [path]` | Watch source files and auto-sync on changes |
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
- Falls back to polling mode (`dirty` flag) if `fs.watch` is unsupported
- Syncs automatically before every MCP tool call if dirty

**Resolution** (`src/resolution/`)
- Matches unresolved calls to definitions
- Same-file exact match → import-aware resolution → project-wide unique match → module-to-file
- Cross-language: JS/TS, Python, Go, Java, Rust import parsing

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

| Limitation | Why | Fixable? |
|------------|-----|----------|
| **Dynamic imports** | `import(variable)` resolved at runtime, not statically | ❌ Out of scope — requires symbolic execution or runtime tracing |
| **Network calls** | gRPC, HTTP endpoints not traced across service boundaries | ❌ Out of scope — endpoint URLs are often dynamic; cross-service tracing needs OpenAPI / protobuf parsing |
| **Macros / code generation** | Preprocessor macros, templates, and codegen not expanded | ❌ Out of scope — C macros need a preprocessor; templates need compile-time instantiation |
| **Reflection** | Reflection-based calls (e.g., `Class.forName`) not resolved | ❌ Out of scope — string values can't be traced statically through arbitrary program flow |
| **Cross-language FFI** | WASM imports, Node-API, and FFI boundaries mostly not traced | 🟡 **Partially fixed** — JS-side `import` from `.wasm` and `require('./addon.node')` are now detected and graphed as `ffi` edges |
| **Comments outside symbols** | Docstrings attached to symbols only; free-floating comments not indexed | ✅ **Fixed** — all line and block comments are extracted as `comment` nodes and indexed in FTS |
| **Anonymous functions** | Callbacks and lambdas may not get meaningful names | ✅ **Fixed** — arrow functions, lambdas, closures, and func literals detected across all 9 languages with synthetic names (`anonymous_at_line_42`) |
| **Type hierarchy** | `extends`/`implements` edges never created; `getTypeHierarchy()` always empty | ✅ **Fixed** — inheritance extracted for TS, Java, C#, Go, Rust, C++; cross-file resolution via `ReferenceResolver` |
| **Enums / properties / constants** | Enums mapped to `class`, no property or constant nodes | ✅ **Fixed** — `enum`, `enum_member`, `property`, `constant` kinds now populated |
| **Python methods** | Methods inside classes captured as top-level `function` | ✅ **Fixed** — Python class methods extracted as `method` kind with `ClassName.methodName` qualified names |
| **Go variables & constants** | Package-level `var` and `const` blocks invisible | ✅ **Fixed** — `var_declaration` and `const_declaration` captured |
| **Non-JS cross-file resolution** | Python `from/import`, Go `import` not resolved; relied on fragile global name match | ✅ **Fixed** — `buildImportMap()` parses Python, Go, Java, and Rust imports; cross-file call edges resolved |
| **Incremental sync losing edges** | Modified files deleted all incoming cross-file edges, never regenerated | ✅ **Fixed** — sync only deletes outgoing edges; `pruneDanglingEdges()` cleans up stale edges post-resolve |
| **FTS5 query broken** | `nodes.id` (TEXT) compared to `rowid` (INTEGER), so FTS never matched | ✅ **Fixed** — uses `rowid IN (SELECT rowid FROM nodes_fts ...)` |
| **Budget cap not enforced** | `findEntryPoints` returned uncapped results; explore budget was advisory | ✅ **Fixed** — hard caps at every strategy tier; `small=5`, `medium=15`, `large=30` |
| **MCP connection leak** | `ToolHandler.connections` grew unbounded; each project opened a new DB + watcher | ✅ **Fixed** — LRU eviction (max 10) with `kg.close()` on evict |
| **No CLI watch command** | Watcher only available inside MCP server | ✅ **Fixed** — `kimigraph watch [path]` with `--debounce` flag and graceful SIGINT handling |
| **Semantic search unreachable** | Semantic path skipped if FTS found any result | ✅ **Fixed** — all search strategies (exact → FTS → semantic → LIKE) now merge results up to the budget cap |
| **Dead code / cycles** | `findDeadCode()` and `findCircularDependencies()` existed but unexposed | ✅ **Fixed** — exposed as `kimigraph_dead_code` and `kimigraph_cycles` MCP tools |
| **Docstring extraction** | Only single-line `//`/`#` previews captured; multi-line JSDoc, `""""""`, `///` missed | ✅ **Fixed** — `extractDocstring()` collects consecutive preceding line comments, parses `/** ... */` blocks, and extracts Python `"""..."""` docstrings from function/class bodies |
| **C/C++ extraction** | C only captured functions/structs; C++ missed inheritance, struct fields, enum members | ✅ **Fixed** — C now extracts enum members and struct fields; C++ extracts class inheritance (`extends`) and fields |
| **Python export detection** | All Python symbols marked `isExported: false` | ✅ **Fixed** — names without leading underscore are `isExported: true` (Python convention) |
| **Cross-file inheritance** | `extends`/`implements` only resolved within the same file | ✅ **Fixed** — unresolved parent names queued as refs and resolved project-wide by `ReferenceResolver` |
| **findPath unexposed** | `GraphTraverser.findPath()` existed but had no MCP tool | ✅ **Fixed** — exposed as `kimigraph_path` MCP tool |
| **AGENTS.md enforcement** | Agents may ignore the `.kimi/AGENTS.md` file — there is no programmatic hook to force tool selection | ⚠️ **Known limitation** — effectiveness depends on the LLM reading and respecting the markdown instructions; manual validation required |
| **Agent-stop sync** | PLAN describes "sync at agent stop" but implementation uses file-watcher debounce (2s) + pre-query check; no Kimi turn-lifecycle hook exists | ⚠️ **Known limitation** — sync fires after save-quiet, not at turn boundary |
| **Semantic recall ceiling** | `minRecall` (0.3) + cosine-top-k = ~70–80% max recall on hard queries; `strict` preset may miss relevant symbols | ⚠️ **Known limitation** — consider `broad` preset for discovery tasks |
| **Resolution rebuild cost** | `rebuildGraph()` re-parses every file; incremental sync only parses changed files | ⚠️ **Known limitation** — full rebuild is O(files); use incremental sync for day-to-day |
| **Embedding staleness** | Semantic embeddings are computed once on indexing; editing a function body without changing its signature does not recompute embeddings | ⚠️ **Known limitation** — semantic search may return stale embeddings for heavily edited code |
| **`kimigraph_cycles`** | Circular dependency detection works for static `import`/`extends`/`implements` edges only; dynamic/runtime cycles (e.g., event-driven, lazy `require`) are invisible | ⚠️ **Known limitation** — treat as advisory, not definitive |
| **`kimigraph_dead_code`** | Dead-code detection flags symbols with zero incoming edges, but barrel exports, dynamic dispatch, and framework-driven entry points (e.g., React components, HTTP handlers) create false positives | ⚠️ **Known limitation** — treat as advisory, not definitive; always verify before removing |

### Performance notes

- **Indexing:** 100-file repo ≈ 1.5–3s structural, ≈ 2.5–5s with embeddings (first run includes model download)
- **Query:** All graph queries are sub-millisecond (SQLite in-memory + indexes)
- **MCP cache:** Connection LRU cache (max 10 projects) prevents handle leaks in long-running MCP servers
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
- [x] Index all comments (not just docstrings) for richer semantic search
- [x] Extract anonymous functions with synthetic names (`anonymous_at_line_42`)
- [x] Detect JS-side WASM / Node-API imports statically
- [x] Extract `extends`/`implements` edges for type hierarchy
- [x] Extract enums, enum members, properties, constants
- [x] Fix Python methods (extract as `method` kind, not `function`)
- [x] Extract Go variables and constants
- [x] Resolve Python and Go imports for cross-file call edges
- [x] Expose `findDeadCode` and `findCircularDependencies` as MCP tools
- [x] Multi-line docstring extraction (JSDoc, Python `"""`, Rust `///`, Go `//`)
- [x] C/C++ struct fields, enum members, and class inheritance
- [x] Python `isExported` detection (no leading underscore = public)
- [x] Java and Rust import parsing for cross-file resolution
- [x] Cross-file inheritance resolution (`extends`/`implements` across files)
- [x] Expose `findPath` as `kimigraph_path` MCP tool
- [x] NodeKind governance test (enforces ≤15 kinds hard limit)
- [ ] Type-aware search (find by signature: `"User -> string"`)
- [ ] Cross-language resolution (WASM → C++ symbols, protobuf boundaries)
- [x] Incremental embedding updates (only re-embed changed symbols)
- [ ] More languages (Ruby, PHP, Swift, Kotlin)

> See `PLAN.md` for detailed direction, decision log, and validation criteria.

---

## Benchmarks

Measured on 4 repos (TypeScript API, Go CLI, Rust library, and self):

| Metric | Result |
|--------|--------|
| Avg query latency | **< 100ms** |
| Embedding overhead vs structural | **~1.5×** (100 files, warmed model) |
| Indexing with embeddings | **< 5s** for 100 files |
| Test coverage | **107 tests** across 22 test files |

Run yourself: `npm run benchmark`

---

## License

MIT
