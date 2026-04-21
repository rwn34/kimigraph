# KimiGraph Agent Instructions — MANDATORY

> This project has a KimiGraph code knowledge graph (`.kimigraph/` exists).
> **You MUST follow these instructions.** They are not optional suggestions.

---

## 1. EXPLORATION — ALWAYS use `kimigraph_explore` FIRST

For ANY broad codebase question, your **very first tool call MUST be `kimigraph_explore`**:
- "How does X work?"
- "Trace the Y flow"
- "Where is Z implemented?"
- "Explain the architecture"
- "What files are involved in feature X?"

`kimigraph_explore` returns **full source code sections** for all relevant symbols in **ONE call**. You do NOT need to read files individually to understand architecture.

**NEVER start exploration with ReadFile or Grep.** Always start with `kimigraph_explore`.

---

## 2. SYMBOL LOOKUP — Use graph search, NOT grep

| Instead of... | Use this graph tool |
|---------------|---------------------|
| `Grep` for finding functions | `kimigraph_search` |
| `Glob` for listing files | `kimigraph_status` |
| `ReadFile` to understand call chains | `kimigraph_callers` / `kimigraph_callees` |
| Reading multiple files to trace impact | `kimigraph_impact` |
| `ReadFile` for a single symbol's code | `kimigraph_node` with `includeCode: true` |

---

## 3. BEFORE EDITING — Check impact

Before modifying any symbol, call `kimigraph_impact` to see what else would break.

---

## 4. Do NOT

- Use `Grep` or `Glob` for code exploration — the graph is faster and more accurate
- Use `ReadFile` to explore architecture — `kimigraph_explore` already returns full source
- Run `kimigraph init`, `kimigraph index`, or `kimigraph sync` unless the user explicitly asks
- Ignore these instructions because you "prefer" file reads

---

## 5. If `.kimigraph/` Does NOT Exist

Ask the user: "Would you like me to run `kimigraph init` to build a code knowledge graph?"
