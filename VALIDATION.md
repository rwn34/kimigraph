# KimiGraph — Validation Criteria

> **Purpose:** Every phase must pass objective, measurable tests before the next phase begins. No subjective "feels done."  
> **Direction:** CodeGraph-simple foundation + KiroGraph hook-based sync. See `PLAN.md`.

---

## 1. Validation Principles

1. **Binary or numeric.** Every criterion is pass/fail or has a number threshold.
2. **Self-testable.** Each section includes the exact command or script to run.
3. **No drift.** If a criterion tries to add scope (embeddings, web UI, architecture analysis), it fails validation.
4. **Block on failure.** Phase N+1 is legally blocked until Phase N passes ALL criteria.

---

## 2. Phase 1 Validation — Foundation

**Status:** Must pass before Phase 2 starts.  
**Self-test command:** `npm run test && npm run build && npm run typecheck`

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 1.1 | Build passes | `npm run build` | Exit code 0 |
| 1.2 | Typecheck passes | `npm run typecheck` | Exit code 0, 0 errors |
| 1.3 | All tests pass | `npx vitest run` | ≥100 tests pass, 0 failures |
| 1.4 | Self-index works | `npx tsx -e "require('./src/index').KimiGraph.open('.').then(kg=>{console.log(kg.getStats());kg.close()})"` | `files > 0`, `nodes > 0`, `edges > 0` |
| 1.5 | npm pack is clean | `npm pack --dry-run` | No warnings, package size < 250 kB |
| 1.6 | No debug scripts in repo | `ls scripts/` | No `debug-*` or `benchmark*` files (unless in `scripts/debug/`) |
| 1.7 | PLAN.md exists and direction is set | `cat PLAN.md | grep -i "direction"` | Contains explicit CodeGraph-primary + KiroGraph-sync-only decision |

**Phase 1 unblock:** All 7 criteria pass.

---

## 3. Phase 2 Validation — Operational

**Status:** Currently 0%. Blocked until Phase 1 passes.  
**Goal:** The graph replaces file reads during exploration.

### 3.1 `kimigraph_explore` MCP Tool

**What it does:** Accepts a natural-language query (e.g., "How does auth work?"), finds relevant symbols via the graph, and returns **full source code sections** for all relevant files in ONE call.

**Reference:** CodeGraph's `codegraph_explore`.

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 2.1.1 | Tool is registered in MCP | `kimi mcp list` + check tool schema | `kimigraph_explore` appears in tools list |
| 2.1.2 | Returns source sections | Call `kimigraph_explore` with query "How does reference resolution work?" on this repo | Returns ≥3 code sections with `filePath`, `startLine`, `endLine`, and `source` (full text) |
| 2.1.3 | No file reads needed | Run benchmark: agent answers exploration questions on a test repo WITH graph vs. WITHOUT graph | With graph: 1 tool call per question (explore). Without graph: ≥5 tool calls per question. |
| 2.1.4 | Respects call budget | Call with `budget: 'small'` vs `budget: 'large'` | Small returns ≤5 sections, large returns ≥10 sections |
| 2.1.5 | Falls back gracefully | Call with nonsense query "How does quantum teleportation work?" on this repo | Returns empty result with helpful message, no crash |

### 3.2 Hook-Based Auto-Sync

**What it does:** Watches source files. On save, marks the graph dirty. When the agent's turn ends (or after N seconds of quiet), auto-runs `sync()`.

**Reference:** KiroGraph's "Save → dirty → agent stop → sync" pattern.

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 2.2.1 | Watches file changes | Edit `src/index.ts`, add a dummy function, save | Within 5 seconds, `kg.getStats()` shows increased node count OR file is marked dirty |
| 2.2.2 | Syncs on agent turn end | Run a Kimi session that edits a file. End the turn. | Graph reflects the edit without manual `kimigraph sync` command |
| 2.2.3 | Does NOT sync during active editing | Rapidly save a file 5 times in 3 seconds | Only ONE sync occurs (debounced), not 5 |
| 2.2.4 | Handles deletions | Delete a source file | File and its nodes/edges removed from graph within 5 seconds |

### 3.3 Kimi Instructions / Auto-Detect

**What it does:** When `.kimigraph/` exists, Kimi automatically knows to use graph tools instead of grep/file reads for exploration.

**Reference:** CodeGraph's auto-injected `CLAUDE.md`.

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 2.3.1 | Auto-detect on init | `kimigraph init` in a test repo | Creates `.kimigraph/` AND writes `.kimi/instructions.md` (or equivalent hook) telling Kimi to use graph tools |
| 2.3.2 | Agent uses `explore` first | Ask Kimi: "How does the database layer work?" in a repo with `.kimigraph/` | First tool call is `kimigraph_explore` or `kimigraph_context`. NOT `ReadFile`, NOT `Grep`. |
| 2.3.2a | **Manual validation note** | — | This criterion requires observing real agent behavior and cannot be automated in unit tests. |
| 2.3.3 | Agent avoids grep for symbol lookup | Ask Kimi: "Find the function that handles auth" | Uses `kimigraph_search` or `kimigraph_explore`. NOT `Grep`. |
| 2.3.3a | **Manual validation note** | — | This criterion requires observing real agent behavior and cannot be automated in unit tests. |
| 2.3.4 | Graceful fallback | Ask Kimi a question in a repo WITHOUT `.kimigraph/` | Agent falls back to normal file reads. No errors. |

### 3.4 Language Expansion: Go, Rust, Java

**What it does:** Parse Go, Rust, and Java source files into the same node/edge model.

**Reference:** CodeGraph's multi-language support.

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 2.4.1 | Go parser works | Create fixture with Go functions, structs, interfaces. Index it. | Functions, methods, structs, interfaces extracted as nodes. Call edges created. |
| 2.4.2 | Rust parser works | Create fixture with Rust functions, structs, traits, impls. Index it. | Functions, methods, structs, traits, impls extracted. Call edges created. |
| 2.4.3 | Java parser works | Create fixture with Java classes, methods, interfaces. Index it. | Classes, methods, interfaces extracted. Call edges created. |
| 2.4.4 | Language detection | Mix TS, Go, Rust, Java files in one repo | `kg.getStats()` shows all 4 languages in `filesByLanguage` |
| 2.4.5 | Integration tests | `npx vitest run` | New language tests pass. Total test count ≥ 100. |

### 3.5 Benchmarks

**What it does:** Prove the value proposition with numbers.

**Reference:** CodeGraph's benchmark suite (VS Code, Excalidraw, Claude Code repos).

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 2.5.1 | Tool-call reduction | Benchmark script: answer 5 exploration questions on 3 repos WITH graph vs. WITHOUT | Average reduction ≥ 70% |
| 2.5.2 | Speed reduction | Same benchmark | Average wall-clock time reduction ≥ 50% |
| 2.5.3 | Zero-file-read queries | Same benchmark | ≥3 of 5 questions answered with ZERO `ReadFile` calls when graph is present |
| 2.5.4 | Reproducible | `npm run benchmark` | Script exists, runs deterministically, outputs JSON |

### Phase 2 Exit Criteria

ALL of the following must be true:
- [ ] 2.1.1 through 2.1.5 pass
- [ ] 2.2.1 through 2.2.4 pass
- [ ] 2.3.1 through 2.3.4 pass
- [ ] 2.4.1 through 2.4.5 pass
- [ ] 2.5.1 through 2.5.4 pass
- [ ] `npm run test` passes with ≥ 25 tests
- [ ] `npm run build` passes
- [ ] No new out-of-scope features added (see Drift Detection)

**Phase 2 unblock:** All exit criteria pass.

---

## 4. Phase 3 Validation — Semantic

**Status:** 0%. **BLOCKED** until Phase 2 passes.  
**Goal:** Natural language symbol search.

| # | Criterion | Test | Pass Threshold |
|---|-----------|------|----------------|
| 3.1 | Embedding model loads | `npm run download-model` or lazy download | Model file exists in `~/.kimigraph/models/`, size ~130MB |
| 3.2 | Symbols are embedded | Index a repo, check DB | `embeddings` table has one row per embeddable node |
| 3.3 | Semantic search works | Query "auth middleware" when function is named `validateJwt` | `validateJwt` is in top-3 results |
| 3.4 | Fallback to FTS5 | Query exact name "validateJwt" | Works even if embeddings fail |
| 3.5 | Performance | Index 100-file repo with embeddings | Indexing time increases by ≤ 3× vs. structural-only |

**Phase 3 unblock:** All criteria pass AND Phase 2 exit criteria still pass (no regression).

---

## 5. Drift Detection

These are **automatic fails** for ANY phase. If any occur, the phase does not pass.

| Anti-Pattern | Detection | Auto-Fail If |
|--------------|-----------|--------------|
| **Embedding creep** | `git diff | grep -i "embed\|vector\|cosine\|similarity"` | Any embedding code appears in Phase 1 or 2 |
| **Web UI creep** | `git diff | grep -i "dashboard\|react\|vue\|html\|css"` | Any UI framework code appears |
| **Architecture analysis creep** | `git diff | grep -i "package.analysis\|layer\|coupling.score\|architecture"` | Any architecture analysis code appears in Phase 1 or 2 |
| **Node kind explosion** | Count node kinds in `types.ts` | > 15 kinds in Phase 1 or 2 |
| **Engine proliferation** | `git diff | grep -i "qdrant\|typesense\|orama\|pglite"` | Any vector engine other than ONE chosen engine in Phase 3 |
| **Test count drop** | `npx vitest run` | Fewer tests pass than previous phase |
| **Build breakage** | `npm run build` | Exit code ≠ 0 |

---

## 6. Self-Test Commands

Run these any time to check current status:

```bash
# Phase 1 health check
npm run build && npm run typecheck && npx vitest run

# Check for drift
git diff --name-only | grep -E "(embed|vector|dashboard|react|qdrant|typesense)" && echo "DRIFT DETECTED" || echo "Clean"

# Self-index check
npx tsx -e "require('./src/index').KimiGraph.open('.').then(kg=>{const s=kg.getStats();console.log(s);kg.close()})"

# npm pack check
npm pack --dry-run 2>&1 | tail -5
```

---

## 7. Sign-Off Log

| Phase | Date | Validator | Status |
|-------|------|-----------|--------|
| Phase 1 | 2026-04-21 | Kimi | ✅ Complete |
| Phase 2 — Reliability | 2026-04-21 | Kimi | ✅ Complete (batching, polling fallback, truncation warning, cycle dedup, silent catches) |
| Phase 2 — Agent behavior (2.3.2, 2.3.3) | 2026-04-25 | rwn34 | ✅ Validated — Kimi calls `kimigraph_explore` first; uses `kimigraph_search` instead of `Grep` |
| Phase 2 — Benchmark claims (2.5.1–2.5.3) | — | — | ⏸️ Blocked — requires agent-in-the-loop harness; cannot be automated in a script |
| Phase 2 — All 11 MCP tools functional | 2026-04-25 | rwn34 | ✅ Validated — systematic tool exercise confirms all tools respond correctly |
| Phase 3 | — | — | 🔄 Unblocked — Phase 2 reliability + agent-behavior complete; benchmark claims remain future work |

---

## 8. Reference Commands for Validation

### How to validate 2.3.2 (agent uses explore first) manually

1. Start MCP server: `npm run mcp`
2. In a Kimi session with `.kimigraph/` initialized, ask: "How does the database layer work?"
3. Check that first tool call is `kimigraph_explore`, not `ReadFile` or `Grep`.
4. Check that the response contains full source sections, not just node names.

### How to validate 2.3.3 (agent avoids grep for symbol lookup) manually

1. Start MCP server: `npm run mcp`
2. In a Kimi session with `.kimigraph/` initialized, ask: "Find the function that handles auth"
3. Check that Kimi uses `kimigraph_search` or `kimigraph_explore`, NOT `Grep`.
4. If Kimi uses `Grep`, check that `.kimi/AGENTS.md` exists and contains the exploration guidelines.

### How to validate hook-based sync manually

1. `kimigraph init` in a test repo
2. Edit a source file, add a new function, save.
3. Run `kimigraph stats` within 5 seconds.
4. Check that node count increased.
5. Delete the file.
6. Run `kimigraph stats` within 5 seconds.
7. Check that node count decreased.

### How to validate 2.5.1–2.5.3 (tool-call / duration / zero-file-read reduction)

**These cannot be validated by `npm run benchmark`.** The benchmark is a performance profiler only.

To validate 2.5.1–2.5.3 you need agent-in-the-loop testing:

1. Set up a test repo with `.kimigraph/` initialized.
2. Run a scripted Kimi session (or capture transcripts) with a set of exploration questions.
3. Count tool calls in the transcript: `ReadFile`, `Grep`, `Glob` vs `kimigraph_*`.
4. Measure wall-clock duration per question (from first prompt to final answer).
5. Compute: tool-call reduction %, duration reduction %, zero-file-read rate.
6. Repeat WITHOUT `.kimigraph/` as baseline.

This is future work. Until then, 2.5.1–2.5.3 remain unvalidated.

### How to run the performance profiler

```bash
npm run benchmark
# Expected output (performance profile — NOT a baseline comparison):
# {
#   "results": [
#     {
#       "project": "ts-api",
#       "totalFiles": 12,
#       "structuralIndexMs": 1500,
#       "embeddingIndexMs": 3200,
#       "queries": [
#         {
#           "query": "How does authMiddleware verify tokens?",
#           "latencyMs": 45,
#           "entryPoints": 3,
#           "relatedNodes": 7,
#           "filesCovered": 4,
#           "strategyBreakdown": { "exact": 1, "fts": 2, "semantic": 3 }
#         }
#       ],
#       "avgQueryLatencyMs": 45
#     }
#   ],
#   "avgLatency": 45,
#   "generatedAt": "2026-04-21T10:00:00.000Z"
# }
#
# NOTE: This measures query latency and file coverage. Tool-call reduction
# vs. baseline agent behavior requires real agent integration testing.
```
