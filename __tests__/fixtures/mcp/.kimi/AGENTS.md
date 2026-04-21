# KimiGraph Agent Instructions

This project has KimiGraph initialized (`.kimigraph/` exists).

## When Exploring Code

**Use `kimigraph_explore` as your PRIMARY tool** for any broad codebase question:
- "How does X work?"
- "Trace the Y flow"
- "Where is Z implemented?"
- "Explain the architecture of Z"

This tool returns full source sections for all relevant symbols in ONE call. You do NOT need to read individual files for exploration.

## For Targeted Lookups (Before Editing)

Use these lightweight tools directly:

| Tool | Use For |
|------|---------|
| `kimigraph_search` | Find symbols by name |
| `kimigraph_callers` / `kimigraph_callees` | Trace call flow |
| `kimigraph_impact` | Check what is affected before editing |
| `kimigraph_node` | Get a single symbol's details + source |

## Do NOT

- Use `Grep` or `Glob` to find symbols — `kimigraph_search` is faster and more accurate
- Use `ReadFile` to explore architecture — `kimigraph_explore` already returns full source
- Run `kimigraph init` or `kimigraph index` unless the user explicitly asks

## If `.kimigraph/` Does NOT Exist

Ask the user: "Would you like me to run `kimigraph init` to build a code knowledge graph?"
