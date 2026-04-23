# KimiGraph Agent Instructions

> This project has a KimiGraph code knowledge graph (`.kimigraph/` exists).
> These are guidelines to help you work more efficiently. Use your judgment.

---

## 1. EXPLORATION — Recommended: use `kimigraph_explore` first

For broad codebase questions, **try `kimigraph_explore` first**:
- "How does X work?"
- "Trace the Y flow"
- "Where is Z implemented?"
- "Explain the architecture"
- "What files are involved in feature X?"

`kimigraph_explore` returns **full source code sections** for relevant symbols in **one call**. Often this is enough to understand architecture without reading files individually.

**Avoid starting exploration with ReadFile or Grep** when a graph tool can answer the question.

---

## 2. SYMBOL LOOKUP — Prefer graph search over grep

| Instead of... | Try this graph tool |
|---------------|---------------------|
| `Grep` for finding functions | `kimigraph_search` |
| `Glob` for listing files | `kimigraph_status` |
| `ReadFile` to understand call chains | `kimigraph_callers` / `kimigraph_callees` |
| Finding unused code | `kimigraph_dead_code` (may have false positives) |
| Checking for circular imports | `kimigraph_cycles` |
| Reading multiple files to trace impact | `kimigraph_impact` |
| `ReadFile` for a single symbol's code | `kimigraph_node` with `includeCode: true` |
| Finding shortest path between two symbols | `kimigraph_path` |

---

## 3. BEFORE EDITING — Check impact

Before modifying any symbol, consider calling `kimigraph_impact` to see what else would break.

---

## 4. Guidelines

- Prefer graph tools for exploration — they are faster and more accurate than grep
- Use `ReadFile` when you need a specific file the graph didn't return
- Avoid running `kimigraph init`, `kimigraph index`, or `kimigraph sync` unless the user explicitly asks
- If the graph doesn't have the answer, fall back to normal file reads

---

## 5. If `.kimigraph/` Does NOT Exist

Ask the user: "Would you like me to run `kimigraph init` to build a code knowledge graph?"
