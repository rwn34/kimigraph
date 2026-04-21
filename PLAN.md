# KimiGraph — Honest Plan & Scope Correction

> **Last updated:** 2026-04-21  
> **Status:** Brutal reassessment after MVP drift

---

## 1. What Was The Original Plan?

Build a **local-first code knowledge graph for Kimi Code CLI**, inspired by:

- **CodeGraph** (colbymchenry / Claude Code) — pre-indexed graph, 14 languages, `codegraph_explore`, file watcher, 92% fewer tool calls
- **KiroGraph** (Kiro IDE) — semantic graph, 24 node kinds, vector embeddings, 90%+ token reduction

**The goal:** Give Kimi a pre-built graph so it queries symbols/calls/impact in **one MCP tool call** instead of burning tokens on 20+ file reads and greps.

---

## 2. Brutal Honest Gap Analysis

### What CodeGraph Does vs. What We Built

| Feature | CodeGraph | KimiGraph (us) | Gap |
|---------|-----------|----------------|-----|
| **Languages** | 14 | 3 (TS/JS/PY) | **-11 languages** |
| **MCP tools** | 8 (incl. `explore`, `files`, `status`) | 7 (no `explore`) | **Missing the key tool** |
| **File watcher** | `cg.watch()` auto-sync | Manual `sync()` only | **Agent must remember to sync** |
| **Agent instructions** | Auto-injected global `CLAUDE.md` | Nothing | **Agent doesn't know to use the graph** |
| **Embeddings / semantic search** | No (structural only) | No | **Same (acceptable for now)** |
| **Benchmarks** | 92% fewer calls, 71% faster | None | **No proof it works** |
| **Call resolution** | Cross-file + cross-language | Cross-file, same-lang only | **Acceptable for MVP** |
| **Type hierarchy** | Full | Stub (`getTypeHierarchy` unwired) | **Unused** |

### What KiroGraph Does vs. What We Built

| Feature | KiroGraph | KimiGraph (us) | Gap |
|---------|-----------|----------------|-----|
| **Vector engines** | 7 (SQLite-vec, PGlite, Qdrant, Typesense, Orama, etc.) | 0 | **No semantic search at all** |
| **Embeddings** | 768-dim nomic-embed-text-v1.5 | None | **Cannot do "auth middleware" → `validateJwt`** |
| **Node kinds** | 24 | 9 | **Missing components, routes, decorators, etc.** |
| **Auto-sync hooks** | "File saved → mark dirty → agent stops → sync" | Nothing | **Graph goes stale immediately** |
| **Dashboard / Web UI** | Yes (Qdrant/Typesense UIs) | No | **Out of scope** |

### The Honest Verdict

**We are ~30% of the way to CodeGraph's functionality and ~15% of the way to KiroGraph's.**

We built the **database layer and parsers** — the foundation. But the features that actually produce the 90%+ token reduction are:

1. **`explore` / `context` tool that returns FULL source sections in ONE call** — so the agent never needs to `ReadFile` during discovery
2. **File watcher + auto-sync** — so the graph is always current without the agent thinking about it
3. **Agent instructions** — telling Kimi "use `kimigraph_context` first, don't grep"
4. **Language coverage** — CodeGraph supports 14; we support 3

We have **none** of #1–#3 fully working, and #1 is the most important.

---

## 3. Why Did We Drift?

The README roadmap lists:

- Vector embeddings for semantic search
- Architecture analysis (packages, layers, coupling)
- File watcher for auto-sync
- More languages (Go, Rust, Java)

**The problem:** Embeddings and architecture analysis are KiroGraph territory — advanced, high-effort features that are NOT required to beat the "grep + read" baseline. We started planning Phase 3 (intelligence) before Phase 2 (operational) was done. This is scope creep.

**What we should have done first:**
1. Make `kimigraph_context` so good that Kimi never needs to read files during exploration
2. Add a file watcher so the graph stays fresh automatically
3. Write Kimi instructions so the agent knows to use the graph
4. Add 3–4 more languages (Go, Rust, Java)
5. **Only then** consider embeddings

---

## 4. Corrected Scope — Locked Until Phase 2 Done

### Out of Scope (Do Not Touch)

| Item | Reason |
|------|--------|
| Vector embeddings / semantic search | KiroGraph feature; CodeGraph doesn't have it and still hits 92% reduction. Revisit after Phase 2. |
| Architecture analysis (packages, layers, coupling) | Nice-to-have; no proven token-reduction value. Revisit after Phase 2. |
| Web UI / dashboard | Completely unrelated to Kimi CLI integration. Delete from roadmap. |
| IDE extensions | Out of scope for this project. |

### In Scope — Phase 1: Foundation (CURRENT — ~97% done)

- [x] SQLite + FTS5 schema
- [x] TS/JS/Python extraction
- [x] Graph traversal (callers, callees, impact, paths, cycles, dead code)
- [x] Reference resolution (same-file + cross-file imports)
- [x] MCP server with 7 tools
- [x] Context builder (`buildContext`)
- [x] CLI (`init`, `index`, `sync`, `query`, `stats`, `mcp`)
- [x] Tests (18/18 passing)
- [x] CI/CD (GitHub Actions)
- [ ] **PENDING:** Commit uncommitted changes + `npm publish`

### In Scope — Phase 2: Operational (NEXT — 0% done)

**Goal: The graph actually replaces file reads during exploration.**

| # | Task | Why It Matters | Effort |
|---|------|----------------|--------|
| 2.1 | **`kimigraph_explore` MCP tool** | Returns full source sections for a natural-language query in ONE call. This is the tool that replaces 10–20 file reads. | **High** |
| 2.2 | **File watcher (`chokidar` or `fs.watch`)** | Watches source files, marks dirty, auto-runs `sync()` on agent turn end or after N seconds of quiet. Graph never goes stale. | **Medium** |
| 2.3 | **Kimi instructions / hooks** | Auto-inject instructions telling Kimi: "If `.kimigraph/` exists, use `kimigraph_context` and `kimigraph_explore` as PRIMARY tools. Do NOT grep or read files for exploration." | **Medium** |
| 2.4 | **Language expansion: Go, Rust, Java** | CodeGraph supports 14; adding 3 more gets us to 6 total, covering ~80% of codebases. Each needs a `.scm` query file. | **Medium** (3 days) |
| 2.5 | **Benchmarks** | Measure tool-call reduction vs. baseline on 3 real repos. Prove the value proposition. | **Low** |

**Phase 2 exit criteria:**
- Agent can answer "How does auth work?" using only `kimigraph_explore` — zero file reads
- File watcher keeps index fresh across edits
- Kimi auto-uses graph tools when `.kimigraph/` exists
- 6 languages supported
- Benchmark shows ≥70% tool-call reduction

### In Scope — Phase 3: Semantic (FUTURE — blocked on Phase 2)

| # | Task | Why It Matters | Effort |
|---|------|----------------|--------|
| 3.1 | **Vector embeddings** | Natural language search: "auth middleware" → `validateJwt`. KiroGraph's main differentiator. | **Very High** |
| 3.2 | **sqlite-vec or `pglite` integration** | Lightweight vector storage without external services. | **High** |
| 3.3 | **Architecture analysis** | Package-level coupling, layer detection, circular dependency reports. | **Medium-High** |

---

## 5. Immediate Actions (This Session)

1. **Commit all changes** — `package.json`, `src/index.ts`, `.github/AGENTS.md`, `CONTRIBUTING.md`
2. **Delete debug scripts** — `scripts/debug-graph-fixture.ts`, `scripts/benchmark.ts` (or move to `scripts/debug/`)
3. **Publish to npm** — `npm publish`
4. **Lock Phase 3 items** — remove "vector embeddings" and "architecture analysis" from README roadmap until Phase 2 is done
5. **Update README** — add honest limitations section: "No file watcher yet. No semantic search yet. 3 languages."
6. **Write this PLAN.md** — ✅ doing now

---

## 6. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-21 | Reject embeddings for now | CodeGraph proves structural graph alone achieves 92% reduction. Embeddings are Phase 3. |
| 2026-04-21 | Reject web UI / dashboard | Zero value for Kimi CLI integration. |
| 2026-04-21 | Reject architecture analysis | Unproven token-reduction value. Phase 3 at earliest. |
| 2026-04-21 | Prioritize `explore` tool + file watcher | These are the two missing pieces that actually replace file reads. |

---

## 7. References

- **CodeGraph** (colbymchenry): https://github.com/colbymchenry/codegraph — 14 languages, 92% fewer tool calls, `cg.watch()`, `codegraph_explore`
- **KiroGraph**: https://dev.to/aws-builders/building-kirograph-a-100-local-semantic-code-knowledge-graph-for-kiro-2ja4 — 24 node kinds, 7 vector engines, embeddings, hooks
- **KimiGraph** (this repo): https://github.com/rwn34/kimigraph — 3 languages, 9 node kinds, structural only, no watcher, no explore
