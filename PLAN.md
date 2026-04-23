# KimiGraph — Plan & Direction

> **Last updated:** 2026-04-21  
> **Direction:** CodeGraph-simple foundation + KiroGraph's hook-based sync. Nothing else.

---

## 1. Direction Decision

We are building a **local-first code knowledge graph for Kimi Code CLI**.

**Primary reference: CodeGraph** (colbymchenry / Claude Code).  
**Secondary reference: KiroGraph** — we take ONLY its hook-based auto-sync pattern.  
**We do NOT follow both.**

### Why CodeGraph as the North Star

| Factor | CodeGraph | KiroGraph | Our Pick |
|--------|-----------|-----------|----------|
| **Proven token reduction** | 92% fewer calls, 71% faster | 90%+ reduction | ✅ CodeGraph — simpler, proven |
| **Complexity** | SQLite + tree-sitter only | 7 vector engines, 24 node kinds | ✅ CodeGraph — we can actually ship this |
| **Embeddings required?** | No | Yes | ✅ CodeGraph — structural graph alone wins |
| **Shipping status** | npm published, stable | Alpha, not on npm | ✅ CodeGraph — proven in production |
| **Stack match** | SQLite, TS, tree-sitter | PGlite, Qdrant, Typesense | ✅ CodeGraph — matches our code |

**The single insight from CodeGraph:** A pre-indexed structural graph (symbols, calls, imports) is enough to replace 90%+ of file reads during exploration. You do NOT need embeddings, semantic search, or architecture analysis to achieve that.

### What We Take From KiroGraph (One Thing Only)

**The hook-based sync pattern:** "File saved → mark dirty → sync when agent stops."  
This is smarter than CodeGraph's passive `cg.watch()` because it syncs at the RIGHT time — when the agent is done working, not on every keystroke.

### What We Reject From Both

| Rejected | Source | Why |
|----------|--------|-----|
| 7 vector engines | KiroGraph | Over-engineered. One lightweight engine in Phase 3 is enough. |
| 24 node kinds | KiroGraph | Too much extraction overhead. 12–15 kinds is the sweet spot. |
| Web UI / dashboard | KiroGraph | Zero value for Kimi CLI integration. |
| Architecture analysis | KiroGraph | Unproven token-reduction value. |
| Cross-language resolution | CodeGraph | Out of scope until we have 6+ languages. |

---

## 2. Honest Gap Analysis

### vs. CodeGraph

| Feature | CodeGraph | KimiGraph (us) | Gap |
|---------|-----------|----------------|-----|
| **Languages** | 14 | 9 (TS/JS/PY/Go/Rust/Java/C/C++/C#) | **-5** |
| **`explore` tool** | `codegraph_explore` — returns full source sections | `kimigraph_explore` — full source sections | **✅ Shipped** |
| **File watcher** | `cg.watch()` passive watcher | `fs.watch` auto-sync + pre-query sync | **✅ Shipped** |
| **Agent instructions** | Auto-injected `CLAUDE.md` | `.kimi/AGENTS.md` + `.kimi/instructions.md` | **✅ Shipped** |
| **MCP tools** | 8 (incl. `files`, `status`, `explore`) | 8 (incl. `explore`) | **✅ Shipped** |
| **Benchmarks** | 92% fewer calls, 71% faster | 77% reduction, 4 repos | **✅ Proven** |
| **Embeddings** | No | nomic-embed-text-v1.5 + sqlite-vec | **✅ Shipped** |

### vs. KiroGraph

| Feature | KiroGraph | KimiGraph (us) | Gap |
|---------|-----------|----------------|-----|
| **Embeddings** | 768-dim nomic-embed-text-v1.5 | nomic-embed-text-v1.5 + sqlite-vec | **✅ Shipped** |
| **Semantic search** | 7 engines | sqlite-vec KNN | **✅ Shipped** |
| **Auto-sync hooks** | "Save → dirty → agent stop → sync" | `fs.watch` debounce + pre-query sync | **✅ Shipped** |
| **Node kinds** | 24 | 9 | **Won't chase. 12–15 is our target.** |
| **Dashboard** | Yes | No | **Rejected** |

**Verdict: We are ~65% of CodeGraph, ~85% of KiroGraph.** Core features shipped: structural graph, semantic search, auto-sync, 9 languages, 14 node kinds, 77% tool-call reduction proven.

---

## 3. Phases

### Phase 1: Foundation (v0.1.0) — ~97% ✅

Structural graph + MCP exposure. The agent CAN query the graph, but it still needs to know to do so.

- [x] SQLite + FTS5 schema
- [x] TS/JS/Python extraction
- [x] Graph traversal (callers, callees, impact, paths, cycles, dead code)
- [x] Reference resolution (cross-file imports)
- [x] MCP server with 7 tools
- [x] Context builder (`buildContext`)
- [x] CLI (`init`, `index`, `sync`, `query`, `stats`, `mcp`)
- [x] Tests (18/18)
- [x] CI/CD
- [x] npm package (dry-run clean)

### Phase 2: Operational (v0.2.0) — 100% ✅ COMPLETE

**Goal: The graph replaces file reads during exploration.**

| # | Task | Reference | Effort |
|---|------|-----------|--------|
| 2.1 | **`kimigraph_explore` MCP tool** | CodeGraph's `codegraph_explore` | **High** |
| 2.2 | **Hook-based auto-sync** | KiroGraph's sync pattern | **Medium** |
| 2.3 | **Kimi instructions / auto-detect** | CodeGraph's `CLAUDE.md` injection | **Medium** |
| 2.4 | **Languages: Go, Rust, Java** | CodeGraph's breadth | **Medium** |
| 2.5 | **Benchmarks** | CodeGraph's benchmark suite | **Low** |

**Phase 2 exit criteria (see VALIDATION.md for testable details):**
- `kimigraph_explore` returns full source sections for a natural-language query in ONE call
- Agent answers "How does X work?" with ZERO file reads
- Hook auto-sync keeps graph fresh without agent intervention
- Kimi auto-uses graph tools when `.kimigraph/` exists
- 6 languages indexed
- Benchmark: ≥70% tool-call reduction vs. baseline on 3 repos

### Phase 3: Semantic (v0.3.0+) — 100% ✅ COMPLETE

**Goal: Natural language symbol search.**

| # | Task | Reference | Effort | Status |
|---|------|-----------|--------|--------|
| 3.1 | **Single lightweight embedding model** | KiroGraph's nomic-embed-text-v1.5 (~130MB) | **High** | ✅ `@huggingface/transformers` lazy load, 768-dim vectors |
| 3.2 | **sqlite-vec integration** | One vector engine, not seven | **High** | ✅ `better-sqlite3` + `sqlite-vec` extension, `vec0` table |
| 3.3 | **Semantic `search` fallback** | "auth middleware" → `validateJwt` | **Medium** | ✅ Semantic tier in `searchNodes` and `ContextBuilder` |

---

## 4. Locked Out-of-Scope List

Do NOT work on these. They are not on the path to replacing file reads.

| Item | Why Rejected | When Revisit |
|------|--------------|--------------|
| Web UI / dashboard | Zero value for CLI agent integration | Never |
| IDE extensions | Different product surface | Never |
| Architecture analysis (packages, layers) | Unproven token-reduction value | Phase 4+ only |
| 24 node kinds | Diminishing returns after 12–15 kinds | Never chase |
| Multiple vector engines | One engine is enough | Never |
| Cross-language resolution | Need 6+ languages first | Phase 4+ |

---

## 5. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-21 | **CodeGraph is primary reference** | Proves structural graph alone achieves 92% reduction. Simpler. Shipping. |
| 2026-04-21 | **KiroGraph contributes ONLY hook-based sync** | Better timing than passive `cg.watch()`. Nothing else. |
| 2026-04-21 | **Reject KiroGraph's 7 vector engines** | Over-engineered. One engine in Phase 3. |
| 2026-04-21 | **Reject architecture analysis** | CodeGraph doesn't have it and still wins. |
| 2026-04-21 | **Reject web UI / dashboard** | Out of scope for CLI agent tool. |

---

## 6. References

- **CodeGraph** (colbymchenry): https://github.com/colbymchenry/codegraph — Primary reference. 14 languages, 92% fewer tool calls, `codegraph_explore`, `cg.watch()`.
- **KiroGraph**: https://dev.to/aws-builders/building-kirograph-a-100-local-semantic-code-knowledge-graph-for-kiro-2ja4 — Secondary reference. Contributes hook-based sync pattern ONLY.
