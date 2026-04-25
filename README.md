# KimiGraph

[![npm version](https://img.shields.io/npm/v/rwn-kimigraph)](https://www.npmjs.com/package/rwn-kimigraph)
[![CI](https://github.com/rwn34/kimigraph/actions/workflows/test.yml/badge.svg)](https://github.com/rwn34/kimigraph/actions)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Pre-indexed code knowledge graph for Kimi Code CLI.**
>
> One MCP tool call replaces 10+ file reads. 100% local. No API keys.

When you ask Kimi "How does authentication work?", the default approach is slow:

```
Glob → ReadFile → ReadFile → Grep → ReadFile → ReadFile → ReadFile → ...
     (10+ tool calls, 30+ seconds)
```

With KimiGraph:

```
kimigraph_explore("authentication flow")
     (1 tool call, < 3 seconds, full source sections returned)
```

---

## What Gets Indexed?

KimiGraph parses your source files into an AST using tree-sitter WASM grammars, then stores everything in a local SQLite database (`.kimigraph/`):

**Nodes** — every symbol in your code

| Kind | Examples |
|------|----------|
| `function` | `validateToken`, `handleRequest` |
| `method` | `UserService.create`, `AuthMiddleware.authenticate` |
| `class` | `AuthService`, `UserController` |
| `interface` | `ITokenPayload`, `DatabaseConfig` |
| `struct` | `Config`, `ConnectionPool` |
| `enum` / `enum_member` | `StatusCode`, `StatusCode.OK` |
| `property` / `field` | `user.name`, `pool.maxSize` |
| `variable` / `constant` | `API_BASE`, `MAX_RETRIES` |
| `import` / `export` | Cross-file and cross-package references |
| `comment` | Line and block comments (indexed for semantic search) |

**Edges** — relationships between symbols

| Edge | Meaning |
|------|---------|
| `contains` | File/module contains symbol |
| `calls` | Function/method calls another |
| `imports` | File imports symbol or package |
| `extends` / `implements` | Inheritance and interface conformance |
| `references` | Variable/field references |
| `instantiates` | `new ClassName()` |
| `overrides` | Method overrides parent |
| `returns` | Return type relationship |
| `ffi` | JS-side WASM / Node-API import |

Everything stays on your machine. No cloud service, no API keys, no telemetry.

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
| Ruby | `.rb` | ✅ |
| PHP | `.php` | ✅ |
| Swift | `.swift` | ✅ |
| Kotlin | `.kt` `.kts` | ✅ |
| Protobuf | `.proto` | ✅ (messages, services, RPCs) |

Mixed-language repositories are fully supported.

---

## Quick Start

```bash
# 1. Install
npm install -g rwn-kimigraph

# 2. Initialize in your project
cd your-project
kimigraph init

# 3. Index the codebase
kimigraph index

# 4. Connect to Kimi CLI
kimigraph install
```

Restart Kimi CLI. That's it — Kimi will now use `kimigraph_explore` automatically when exploring your codebase.

### What `kimigraph install` does

It auto-detects your setup and writes `~/.kimi/mcp.json` with the correct command:

| Scenario | Command written | Why |
|----------|----------------|-----|
| `kimigraph` is in PATH | `kimigraph serve --mcp` | Fastest — no wrapper overhead |
| Not in PATH (Windows, local install, etc.) | `node <globalPath> serve --mcp` | Resolves the exact JS path, bypasses `npx` stdio issues |

---

## MCP Tools

KimiGraph exposes 11 MCP tools. Kimi uses them automatically (via `.kimi/AGENTS.md` instructions written by `kimigraph init`).

| Tool | Purpose | When Kimi Uses It |
|------|---------|-------------------|
| `kimigraph_explore` | **Primary tool.** Returns full source sections for all relevant symbols in one call | "How does X work?" |
| `kimigraph_search` | Find symbols by name (exact → FTS → semantic → LIKE fallback) | "Find the auth function" |
| `kimigraph_context` | Build comprehensive task context from natural language | "Implement feature Y" |
| `kimigraph_callers` | Who calls this symbol | "Who uses this?" |
| `kimigraph_callees` | What this symbol calls | "What does this depend on?" |
| `kimigraph_impact` | What's affected by changing a symbol | "What breaks if I change this?" |
| `kimigraph_node` | Get a single symbol's details + full source | "Show me the implementation" |
| `kimigraph_path` | Shortest path between two symbols | "How does A reach B?" |
| `kimigraph_dead_code` | Symbols with zero incoming references (experimental) | "Find unused code" |
| `kimigraph_cycles` | Circular dependency chains (experimental) | "Find circular imports" |
| `kimigraph_status` | Check index health and stats | "Is the graph up to date?" |
| `kimigraph_signature_search` | Find functions by type signature (e.g. `string -> boolean`) | "Find functions that take a string and return a bool" |

---

## Example Session

```bash
$ cd my-project
$ kimigraph index
  Indexed 23 files, 412 symbols, 1,024 edges in 2.1s

$ kimigraph query "validate"
  function validateToken    — src/auth.ts:45
  function validateEmail    — src/users.ts:12
  method validate           — src/forms.ts:88

$ kimigraph callers validateToken
  Callers of function validateToken (src/auth.ts:45):
    function login         — src/auth.ts:120
    function refresh       — src/auth.ts:156
    method authenticate    — src/services/auth.ts:34

$ kimigraph impact validateToken
  Impact radius of function validateToken (src/auth.ts:45):
    function login         — src/auth.ts:120
    function refresh       — src/auth.ts:156
    method authenticate    — src/services/auth.ts:34
    class AuthService      — src/services/auth.ts:8
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Kimi CLI (Agent)                            │
│                                                                     │
│   "How does auth work?"                                             │
│            │                                                        │
│            ▼                                                        │
│   kimigraph_explore("auth flow") ──► (1 tool call)                  │
│            │                                                        │
└────────────┼────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     KimiGraph MCP Server                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  explore │  │  search  │  │  callers │  │  impact  │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       └─────────────┴─────────────┴─────────────┘                   │
│                          │                                          │
│                          ▼                                          │
│   ┌─────────────────────────────────────────────┐                   │
│   │  SQLite Graph DB  (.kimigraph/)             │                   │
│   │  • 412 symbols   • 1,024 edges              │                   │
│   │  • FTS5 full-text  • sqlite-vec (768-dim)   │                   │
│   │  • Instant lookups  • Sub-millisecond query │                   │
│   └─────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
             │
             ▼
   Full source sections returned
   (functions, classes, call chains, context)
```

1. **Parse** — tree-sitter WASM grammars extract symbols and relationships
2. **Store** — SQLite with WAL mode, FTS5 full-text search, and sqlite-vec for semantic vectors
3. **Query** — Kimi asks natural-language questions; the graph returns relevant code with full source

The embedding model (`nomic-ai/nomic-embed-text-v1.5`, ~130MB) downloads once to `~/.kimigraph/models/`. No network calls happen during normal operation.

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

## Architecture

**Extraction** (`src/extraction/`)
- Parses code with tree-sitter WASM grammars
- Extracts functions, classes, methods, imports, exports, calls
- Creates unresolved references for cross-file resolution

**Database** (`src/db/`)
- SQLite with WAL mode for performance
- FTS5 full-text search over names, signatures, docstrings, comments
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

## Installation Requirements

KimiGraph installs via npm. Native dependencies (`better-sqlite3`, `sqlite-vec`) ship prebuilt binaries for common platforms — no compiler toolchain needed in most cases.

| Platform | Requirements | Notes |
|----------|-------------|-------|
| **Linux** (Debian, Ubuntu, etc.) | Node ≥18, `glibc` | Prebuilt binaries available for x64 and arm64. If your architecture lacks a prebuild, install `build-essential python3` for node-gyp fallback. |
| **Windows** | Node ≥18 | Prebuilt binaries available for x64. Works on Windows 10/11 and Server 2019+. |
| **macOS** | Node ≥18 | Prebuilt binaries available for Intel and Apple Silicon. |

**CI verified:** All 9 combinations (Ubuntu / Windows / macOS × Node 18 / 20 / 22) pass tests on every push.

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
| **Dynamic imports** | `import(variable)` resolved at runtime, not statically | ❌ Out of scope — requires symbolic execution |
| **Network calls** | gRPC, HTTP endpoints not traced across service boundaries | ❌ Out of scope — needs OpenAPI / protobuf parsing |
| **Macros / code generation** | Preprocessor macros, templates, and codegen not expanded | ❌ Out of scope — needs compile-time expansion |
| **Reflection** | Reflection-based calls (e.g., `Class.forName`) not resolved | ❌ Out of scope — string values can't be traced statically |
| **Cross-language FFI** | WASM imports, Node-API, and FFI boundaries mostly not traced | 🟡 **Partially fixed** — JS-side `import` from `.wasm` and `require('./addon.node')` are detected and graphed as `ffi` edges |
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
| **Semantic search unreachable** | Semantic path skipped if FTS found any result | ✅ **Fixed** — all search strategies now merge results up to the budget cap |
| **Dead code / cycles** | `findDeadCode()` and `findCircularDependencies()` existed but unexposed | ✅ **Fixed** — exposed as `kimigraph_dead_code` and `kimigraph_cycles` MCP tools |
| **Docstring extraction** | Only single-line `//`/`#` previews captured; multi-line JSDoc, `""""""`, `///` missed | ✅ **Fixed** — `extractDocstring()` collects consecutive preceding line comments, parses `/** ... */` blocks, and extracts Python `"""..."""` docstrings |
| **C/C++ extraction** | C only captured functions/structs; C++ missed inheritance, struct fields, enum members | ✅ **Fixed** — C now extracts enum members and struct fields; C++ extracts class inheritance (`extends`) and fields |
| **Python export detection** | All Python symbols marked `isExported: false` | ✅ **Fixed** — names without leading underscore are `isExported: true` (Python convention) |
| **Cross-file inheritance** | `extends`/`implements` only resolved within the same file | ✅ **Fixed** — unresolved parent names queued as refs and resolved project-wide by `ReferenceResolver` |
| **findPath unexposed** | `GraphTraverser.findPath()` existed but had no MCP tool | ✅ **Fixed** — exposed as `kimigraph_path` MCP tool |
| **AGENTS.md enforcement** | Agents may ignore `.kimi/AGENTS.md` — no programmatic hook to force tool selection | ⚠️ **Known limitation** — effectiveness depends on the LLM respecting the markdown instructions |
| **Agent-stop sync** | PLAN describes "sync at agent stop" but implementation uses file-watcher debounce (2s) + pre-query check | ⚠️ **Known limitation** — sync fires after save-quiet, not at turn boundary |
| **Semantic recall ceiling** | `minRecall` (0.3) + cosine-top-k = ~70–80% max recall on hard queries | ⚠️ **Known limitation** — consider `broad` preset for discovery tasks |
| **Resolution rebuild cost** | `rebuildGraph()` re-parses every file; incremental sync only parses changed files | ⚠️ **Known limitation** — full rebuild is O(files); use incremental sync for day-to-day |
| **Embedding staleness** | Semantic embeddings are computed once on indexing; editing a function body without changing its signature does not recompute embeddings | ⚠️ **Known limitation** — semantic search may return stale embeddings for heavily edited code |
| **`kimigraph_cycles`** | Circular dependency detection works for static `import`/`extends`/`implements` edges only; dynamic/runtime cycles are invisible | ⚠️ **Known limitation** — treat as advisory, not definitive |
| **`kimigraph_dead_code`** | Dead-code detection flags symbols with zero incoming edges, but barrel exports, dynamic dispatch, and framework-driven entry points create false positives | ⚠️ **Known limitation** — treat as advisory, not definitive; always verify before removing |

### Installation warnings (harmless upstream deprecations)

During `npm install` you may see two deprecation warnings from transitive dependencies:

| Warning | Source | Status |
|---------|--------|--------|
| `prebuild-install@7.1.3` deprecated | `better-sqlite3` → `prebuild-install` | Upstream — `better-sqlite3` v12.9.0 is latest stable; we evaluated `libsql` as replacement but it has Windows file-locking issues |
| `boolean@3.2.0` deprecated | `@huggingface/transformers` → `onnxruntime-node` → `global-agent` → `boolean` | Upstream — no maintained replacement exists |

Both packages still function correctly. We will migrate away when upstream provides stable alternatives.

### Performance notes

- **Indexing:** 100-file repo ≈ 1.5–3s structural, ≈ 2.5–5s with embeddings (first run includes model download)
- **Query:** All graph queries are sub-millisecond (SQLite in-memory + indexes)
- **MCP cache:** Connection LRU cache (max 10 projects) prevents handle leaks in long-running MCP servers
- **Memory:** Vectors stay in SQLite (vec0), not loaded into memory
- **Disk:** ~1–5MB per 100 files for structural index; ~2–5MB additional for embeddings

---

## Benchmarks

Measured on 4 repos (TypeScript API, Go CLI, Rust library, and self):

| Metric | Result |
|--------|--------|
| Avg query latency | **< 100ms** |
| Embedding overhead vs structural | **~1.5×** (100 files, warmed model) |
| Indexing with embeddings | **< 5s** for 100 files |
| Test coverage | **118 tests** across 25 test files |

Run yourself: `npm run benchmark`

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

**Phase 5 — Deepen (v0.4)**
- [x] Index all comments for richer semantic search
- [x] Extract anonymous functions with synthetic names
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
- [x] Incremental embedding updates (only re-embed changed symbols)
- [x] Type-aware search (find by signature: `"User -> string"`)
- [x] Cross-language resolution (protobuf messages, services, and RPCs; WASM FFI edges)
- [x] More languages (Ruby, PHP, Swift, Kotlin)

> See `PLAN.md` for detailed direction, decision log, and validation criteria.

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

**`Invalid JSON: Unexpected UTF-8 BOM`**
Delete `~/.kimi/mcp.json` and re-run `kimigraph install`. The config file was written with a BOM.

---

## License

MIT
