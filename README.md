# rwn-KimiGraph

Local-first semantic code knowledge graph for [Kimi Code CLI](https://github.com/MoonshotAI/kimi-cli).

**One MCP tool call replaces 10+ file reads.** KimiGraph parses your codebase into an AST, extracts symbols and relationships, and stores them in a local SQLite database. Kimi queries the graph instantly instead of scanning files.

## Quick Start

```bash
# Install globally
npm install -g rwn-kimigraph

# Initialize in your project
cd your-project
kimigraph init

# Index the codebase
kimigraph index

# Connect to Kimi CLI
kimigraph install
```

Restart Kimi CLI. Kimi will now use `kimigraph_context` as its primary exploration tool.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `kimigraph_search` | Find symbols by name |
| `kimigraph_context` | Build comprehensive task context |
| `kimigraph_callers` | Who calls this symbol |
| `kimigraph_callees` | What this symbol calls |
| `kimigraph_impact` | What's affected by a change |
| `kimigraph_node` | Get symbol details |
| `kimigraph_status` | Check index health |

## Supported Languages

- TypeScript / JavaScript
- Python

More languages coming in future releases.

## How It Works

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Kimi CLI   │────▶│  MCP stdio      │────▶│  SQLite DB  │
│             │◀────│  kimigraph      │◀────│  .kimigraph/│
└─────────────┘     └─────────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              tree-sitter    graph
              AST parser     traversal
```

100% local. No API keys. No external services.

## License

MIT
