# Contributing to rwn-KimiGraph

## Development Setup

```bash
git clone https://github.com/rwn34/kimigraph.git
cd kimigraph
npm install
```

## Build

```bash
npm run build        # One-time build
npm run dev          # Watch mode
npm run typecheck    # TypeScript strict check
```

## Test

```bash
npm test             # Run all tests
npm run test:watch   # Watch mode
```

## Project Structure

```
src/
  bin/kimigraph.ts   # CLI entry point
  index.ts           # Public API
  types.ts           # All TypeScript interfaces
  config.ts          # Config read/write
  directory.ts       # .kimigraph/ directory management
  errors.ts          # Error classes + logging
  utils.ts           # Shared utilities
  db/
    index.ts         # Database connection wrapper
    schema.sql       # SQLite schema
    queries.ts       # SQL query builder
  extraction/
    index.ts         # Extraction orchestrator
    grammar.ts       # Tree-sitter grammar loading
    queries/         # .scm files per language
  graph/
    index.ts         # Graph traversal algorithms
  context/
    index.ts         # Context builder for tasks
  resolution/
    index.ts         # Reference resolver
  mcp/
    server.ts        # MCP stdio server
    transport.ts     # JSON-RPC over stdio
    tools.ts         # Tool definitions
```

## Adding a Language

1. Add grammar WASM to `src/extraction/grammar.ts`
2. Write `.scm` query file in `src/extraction/queries/`
3. Add language detection in `src/types.ts`
4. Add import resolution logic in `src/resolution/index.ts`
5. Add tests in `__tests__/`

## Commit Messages

Use imperative mood:
- `feat: add Go language support`
- `fix: resolve relative imports in TS path aliases`
- `test: add coverage for impact radius`
- `docs: update README with troubleshooting`
