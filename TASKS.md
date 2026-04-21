# KimiGraph — Execution Task List

> **Follows:** `PLAN.md` exclusively.  
> **Validates against:** `VALIDATION.md`.  
> **Direction:** CodeGraph-simple foundation + KiroGraph hook-based sync.  

---

## How to Use This File

1. Pick the next unblocked task (no incomplete dependencies).
2. Do it. Commit when done.
3. Run the validation command for that task.
4. Check the box. Move to the next.

**Do NOT skip ahead.** Phase 3 is blocked until Phase 2 passes ALL validation criteria.

---

## Phase 1 — Foundation Close-Out

### P1.1 Publish to npm

| Field | Value |
|-------|-------|
| **Task** | `npm publish` |
| **Deliverable** | Package `rwn-kimigraph@0.1.0` live on npm registry |
| **Effort** | 5 min |
| **Dependencies** | Phase 1 validation passes (`npm run test && npm run build && npm run typecheck`) |
| **Validation** | `npm view rwn-kimigraph@0.1.0` returns package metadata |
| **Blocked by** | Requires user to run `npm login` first |
| **Assignee** | **User** (needs npm credentials) |

```bash
npm login
npm publish
```

---

## Phase 2 — Operational

**Goal:** The graph replaces file reads during exploration.  
**Blocker:** Phase 1 close-out (P1.1).  
**Parallel tracks:** A (explore + instructions), B (sync), C (languages). Track D (benchmarks) is last.

---

### Track A: Explore Tool + Agent Instructions

#### A1 Implement `kimigraph_explore` MCP tool

| Field | Value |
|-------|-------|
| **Task** | Add `kimigraph_explore` to MCP tools |
| **Deliverable** | `src/mcp/tools.ts` updated with new tool + handler. Agent can call it. |
| **Effort** | 4–6 hours |
| **Dependencies** | None (Track A start) |
| **Validation** | VALIDATION.md 2.1.1–2.1.5 |

**Implementation notes:**

This tool is the single most important feature in Phase 2. It replaces 10–20 file reads with one MCP call.

CodeGraph's `codegraph_explore` accepts:
- `query` (string) — natural language task description
- `budget` (enum: small/medium/large) — controls how much context to return

What it returns:
- Full source code sections for all relevant symbols
- File paths and line ranges
- A summary of what was found

Our implementation should reuse `ContextBuilder.buildContext()` (already does natural language → symbols) but:
1. Add a `budget` parameter that maps to `maxNodes` (small=10, medium=20, large=40)
2. Return ALL source sections, not just snippets — the agent should never need to `ReadFile` for these symbols
3. Include file path + line range metadata for each section
4. Format as markdown with clear separators

**Files to modify:**
- `src/mcp/tools.ts` — add tool definition + handler
- `src/types.ts` — add `ExploreBudget` type if needed
- `__tests__/mcp.test.ts` — new test file for MCP tool behavior

**Validation commands:**
```bash
# Tool appears in schema
npx tsx -e "const {tools}=require('./src/mcp/tools'); console.log(tools.map(t=>t.name))"

# Returns source sections
# (Manual: start MCP server, call explore with query)
```

---

#### A2 Add `getProjectRoot()` to `KimiGraph`

| Field | Value |
|-------|-------|
| **Task** | Expose project root path for MCP status tool |
| **Deliverable** | `KimiGraph.getProjectRoot()` method exists and returns correct path |
| **Effort** | 15 min |
| **Dependencies** | A1 (needed by status tool) |
| **Validation** | `kg.getProjectRoot()` returns absolute path string |

**Files to modify:**
- `src/index.ts` — add `getProjectRoot()` method

---

#### A3 Implement Kimi auto-instructions

| Field | Value |
|-------|-------|
| **Task** | Write Kimi instructions when `.kimigraph/` is detected |
| **Deliverable** | `kimigraph init` writes instructions. Kimi uses graph tools automatically. |
| **Effort** | 3–4 hours |
| **Dependencies** | A1 (`explore` must exist before we tell agent to use it) |
| **Validation** | VALIDATION.md 2.3.1–2.3.4 |

**Implementation notes:**

CodeGraph auto-injects a `CLAUDE.md` file. For Kimi, we need to find the equivalent mechanism.

Possible approaches (research required):
1. **Project-level `.kimi/instructions.md`** — if Kimi reads this automatically
2. **Hook-based injection** — use `PreToolUse` hook to prepend instructions to agent context
3. **MCP tool description** — enhance tool descriptions so Kimi naturally prefers them
4. **`~/.kimi/mcp.json` metadata** — if Kimi supports per-server instructions

**Research task first:** Check Kimi CLI docs for project-level instruction mechanisms.

**Minimum viable approach (if no auto-read mechanism exists):**
- `kimigraph init` prints instructions that the user must copy into their Kimi config
- Document this in README
- Enhance MCP tool descriptions to say "PRIMARY TOOL — use this before reading files"

**Files to modify:**
- `src/directory.ts` or `src/index.ts` — add instruction writing logic
- `README.md` — document manual setup if auto-injection isn't possible

---

### Track B: Hook-Based Auto-Sync

#### B1 Implement file watcher with dirty flag

| Field | Value |
|-------|-------|
| **Task** | Watch source files, mark dirty on change, debounced auto-sync |
| **Deliverable** | `KimiGraph.watch()` and `KimiGraph.unwatch()` methods. Graph stays fresh. |
| **Effort** | 4–6 hours |
| **Dependencies** | None (Track B start) |
| **Validation** | VALIDATION.md 2.2.1–2.2.4 |

**Implementation notes:**

We use Node.js `fs.watch` (no new dependencies) with debouncing.

Behavior:
1. `watch()` starts watching all tracked source files + the project root for new files
2. On any change: set dirty flag, start debounce timer (2 seconds)
3. If no more changes within 2 seconds: run `sync()`
4. `unwatch()` stops all watchers

Alternative: watch the project root recursively and filter by include patterns.

**Files to modify:**
- `src/index.ts` — add `watch()`, `unwatch()`, private watcher management
- `src/directory.ts` or new `src/watcher.ts` — watcher logic
- `__tests__/sync.test.ts` — test auto-sync behavior

**Edge cases to handle:**
- File deleted while watching → sync removes it
- Rapid edits → only one sync after quiet period
- `watch()` called twice → no duplicate watchers
- `close()` while watching → clean up all watchers

**Validation commands:**
```bash
# File edit → graph updated
npx vitest run __tests__/sync.test.ts
```

---

#### B2 Integrate watcher into MCP lifecycle

| Field | Value |
|-------|-------|
| **Task** | Auto-start watcher when MCP server starts |
| **Deliverable** | `kimigraph mcp` starts watcher automatically. Stops on exit. |
| **Effort** | 1 hour |
| **Dependencies** | B1 |
| **Validation** | MCP server starts, edit a file, `kimigraph_status` reflects change within 5 seconds |

**Files to modify:**
- `src/mcp/server.ts` or `src/bin/kimigraph.ts` — start watcher on MCP init

---

### Track C: Language Expansion

Track C has 3 parallel subtasks. They are identical in structure.

#### C1 Add Go parser

| Field | Value |
|-------|-------|
| **Task** | Tree-sitter Go grammar + SCM query file |
| **Deliverable** | `src/extraction/queries/go.scm`. Go files indexed correctly. |
| **Effort** | 3–4 hours |
| **Dependencies** | None (Track C start) |
| **Validation** | VALIDATION.md 2.4.1 |

**Implementation notes:**

1. Add `go` to `KimiGraphLanguage` union type
2. Add Go grammar WASM to `tree-sitter-wasms` or download it
3. Write `src/extraction/queries/go.scm` capturing:
   - `function_declaration` / `method_declaration`
   - `type_declaration` (structs, interfaces)
   - `call_expression`
   - `import_declaration`
4. Add Go to `detectLanguage()`
5. Add fixture + test

**Files to modify:**
- `src/types.ts` — add `go` to language types
- `src/extraction/grammar.ts` — register Go WASM
- `src/extraction/queries/go.scm` — new file
- `src/utils.ts` — `detectLanguage()` update
- `__tests__/fixtures/go/` — fixture files
- `__tests__/extraction.test.ts` — Go test cases

---

#### C2 Add Rust parser

| Field | Value |
|-------|-------|
| **Task** | Tree-sitter Rust grammar + SCM query file |
| **Deliverable** | `src/extraction/queries/rust.scm`. Rust files indexed correctly. |
| **Effort** | 3–4 hours |
| **Dependencies** | None (Track C start, parallel with C1) |
| **Validation** | VALIDATION.md 2.4.2 |

**Implementation notes:**

Same pattern as C1. Capture:
- `function_item`
- `impl_item` / `trait_item`
- `struct_item` / `enum_item`
- `call_expression`
- `use_declaration`

---

#### C3 Add Java parser

| Field | Value |
|-------|-------|
| **Task** | Tree-sitter Java grammar + SCM query file |
| **Deliverable** | `src/extraction/queries/java.scm`. Java files indexed correctly. |
| **Effort** | 3–4 hours |
| **Dependencies** | None (Track C start, parallel with C1, C2) |
| **Validation** | VALIDATION.md 2.4.3 |

**Implementation notes:**

Same pattern as C1. Capture:
- `method_declaration`
- `class_declaration`
- `interface_declaration`
- `method_invocation`
- `import_declaration`

---

#### C4 Language integration test

| Field | Value |
|-------|-------|
| **Task** | Mixed-language repo integration test |
| **Deliverable** | Test passes: TS + Go + Rust + Java in one repo, all indexed. |
| **Effort** | 1 hour |
| **Dependencies** | C1, C2, C3 all complete |
| **Validation** | VALIDATION.md 2.4.4–2.4.5 |

---

### Track D: Benchmarks

#### D1 Create benchmark harness

| Field | Value |
|-------|-------|
| **Task** | Script that measures tool calls with vs. without graph |
| **Deliverable** | `scripts/benchmark.ts` (or `npm run benchmark`). Reproducible JSON output. |
| **Effort** | 4–6 hours |
| **Dependencies** | A1, A3, B1, C1–C3 |
| **Validation** | VALIDATION.md 2.5.1–2.5.4 |

**Implementation notes:**

Benchmark methodology (matches CodeGraph's approach):

1. Select 3 test repos (can be public GitHub repos):
   - Small: ~50 files (e.g., a CLI tool)
   - Medium: ~500 files (e.g., a framework)
   - Large: ~2000+ files (e.g., VS Code or similar)

2. Define 5 standard exploration questions:
   - "How does authentication work?"
   - "Trace the request flow from entry to response"
   - "How is the database layer structured?"
   - "Find the error handling pattern"
   - "What code would be affected by changing X?"

3. Run each question:
   - **Baseline:** Agent WITHOUT graph (normal file reads + grep)
   - **With graph:** Agent WITH graph (must use explore/context tools)
   - Count tool calls, wall-clock time, file reads

4. Output JSON with averages.

**Files to modify:**
- `scripts/benchmark.ts` — new file
- `package.json` — add `"benchmark": "tsx scripts/benchmark.ts"` script

---

## Execution Order

```
Week 1
├── P1.1  npm publish (user action)
├── A1    explore tool
├── B1    file watcher
└── C1    Go parser (parallel)

Week 2
├── A2    getProjectRoot()
├── A3    Kimi instructions
├── B2    MCP watcher integration
├── C2    Rust parser (parallel)
└── C3    Java parser (parallel)

Week 3
├── C4    language integration test
├── D1    benchmark harness
└── Phase 2 validation run
```

**Parallelization:**
- A1 and B1 can start immediately in parallel.
- C1, C2, C3 can run in parallel after A1/B1 start (or even before, they're independent).
- A2 depends on A1.
- A3 depends on A1.
- B2 depends on B1.
- C4 depends on C1+C2+C3.
- D1 depends on A1+A3+B1+C1+C2+C3.

---

## Task Dependency Graph

```
P1.1 (npm publish)
  │
  ▼
A1 (explore tool) ──► A2 (getProjectRoot) ──► A3 (instructions)
  │
B1 (watcher) ──► B2 (MCP integration)
  │
C1 (Go) ──┐
C2 (Rust)─┼──► C4 (integration)
C3 (Java)─┘
  │
  ▼
D1 (benchmarks)
  │
  ▼
Phase 2 Validation → Phase 3 Unblocked
```

---

## Validation Checklist

Run this BEFORE claiming Phase 2 is done:

- [ ] `npm run test` passes (≥ 25 tests)
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes
- [ ] `kimigraph_explore` tool appears in MCP schema
- [ ] `kimigraph_explore` returns ≥3 source sections for test query
- [ ] Agent answers "How does X work?" with ≤3 tool calls
- [ ] File edit → graph updated within 5 seconds (no manual sync)
- [ ] File deletion → nodes removed within 5 seconds
- [ ] Rapid saves → only one sync (debounced)
- [ ] Kimi uses `kimigraph_explore` before `ReadFile` for exploration
- [ ] Go fixture indexed: functions, structs, interfaces, calls
- [ ] Rust fixture indexed: functions, structs, traits, impls, calls
- [ ] Java fixture indexed: classes, methods, interfaces, calls
- [ ] Mixed repo shows all 4 languages in stats
- [ ] Benchmark: ≥70% tool-call reduction
- [ ] Benchmark: ≥50% wall-clock reduction
- [ ] No drift (no embedding/UI/architecture code added)

---

## Sign-Off

| Track | Lead | Start Date | Done Date |
|-------|------|------------|-----------|
| A: Explore + Instructions | | | |
| B: Sync | | | |
| C: Languages | | | |
| D: Benchmarks | | | |
