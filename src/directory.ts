/**
 * Directory management for KimiGraph.
 */

import * as fs from 'fs';
import * as path from 'path';
import { KIMIGRAPH_DIR } from './config';

export function isInitialized(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, KIMIGRAPH_DIR));
}

export function createDirectory(projectRoot: string): void {
  const dir = path.join(projectRoot, KIMIGRAPH_DIR);
  fs.mkdirSync(dir, { recursive: true });

  // Create .gitignore for the kimigraph directory
  const gitignorePath = path.join(dir, '.gitignore');
  fs.writeFileSync(gitignorePath, '*.db\n*.db-journal\n*.db-wal\n*.db-shm\n', 'utf8');
}

export function getDatabasePath(projectRoot: string): string {
  return path.join(projectRoot, KIMIGRAPH_DIR, 'db.sqlite');
}

export function findNearestKimiGraphRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, KIMIGRAPH_DIR))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function validateDirectory(projectRoot: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const dir = path.join(projectRoot, KIMIGRAPH_DIR);

  if (!fs.existsSync(dir)) {
    errors.push(`${KIMIGRAPH_DIR}/ directory does not exist`);
  }

  return { valid: errors.length === 0, errors };
}

const AGENTS_MD_CONTENT = `# KimiGraph Agent Instructions — MANDATORY

> This project has a KimiGraph code knowledge graph (\`.kimigraph/\` exists).
> **You MUST follow these instructions.** They are not optional suggestions.

---

## 1. EXPLORATION — ALWAYS use \`kimigraph_explore\` FIRST

For ANY broad codebase question, your **very first tool call MUST be \`kimigraph_explore\`**:
- "How does X work?"
- "Trace the Y flow"
- "Where is Z implemented?"
- "Explain the architecture"
- "What files are involved in feature X?"

\`kimigraph_explore\` returns **full source code sections** for all relevant symbols in **ONE call**. You do NOT need to read files individually to understand architecture.

**NEVER start exploration with ReadFile or Grep.** Always start with \`kimigraph_explore\`.

---

## 2. SYMBOL LOOKUP — Use graph search, NOT grep

| Instead of... | Use this graph tool |
|---------------|---------------------|
| \`Grep\` for finding functions | \`kimigraph_search\` |
| \`Glob\` for listing files | \`kimigraph_status\` |
| \`ReadFile\` to understand call chains | \`kimigraph_callers\` / \`kimigraph_callees\` |
| Reading multiple files to trace impact | \`kimigraph_impact\` |
| \`ReadFile\` for a single symbol's code | \`kimigraph_node\` with \`includeCode: true\` |

---

## 3. BEFORE EDITING — Check impact

Before modifying any symbol, call \`kimigraph_impact\` to see what else would break.

---

## 4. Do NOT

- Use \`Grep\` or \`Glob\` for code exploration — the graph is faster and more accurate
- Use \`ReadFile\` to explore architecture — \`kimigraph_explore\` already returns full source
- Run \`kimigraph init\`, \`kimigraph index\`, or \`kimigraph sync\` unless the user explicitly asks
- Ignore these instructions because you "prefer" file reads

---

## 5. If \`.kimigraph/\` Does NOT Exist

Ask the user: "Would you like me to run \`kimigraph init\` to build a code knowledge graph?"
`;

const INSTRUCTIONS_MD_CONTENT = `# KimiGraph — Project Instructions

This project uses KimiGraph for code intelligence.

**Rule: Always use \`kimigraph_explore\` as your first tool when exploring code.**

The graph contains pre-indexed symbols, calls, and imports. It returns full source sections in one call, replacing the need for file-by-file exploration.

Available tools: \`kimigraph_search\`, \`kimigraph_context\`, \`kimigraph_explore\`, \`kimigraph_callers\`, \`kimigraph_callees\`, \`kimigraph_impact\`, \`kimigraph_node\`, \`kimigraph_status\`.
`;

export function writeAgentInstructions(projectRoot: string): void {
  const kimiDir = path.join(projectRoot, '.kimi');
  fs.mkdirSync(kimiDir, { recursive: true });

  // Primary instructions file
  const agentsPath = path.join(kimiDir, 'AGENTS.md');
  fs.writeFileSync(agentsPath, AGENTS_MD_CONTENT, 'utf8');

  // Fallback for Kimi CLI versions that read instructions.md
  const instructionsPath = path.join(kimiDir, 'instructions.md');
  fs.writeFileSync(instructionsPath, INSTRUCTIONS_MD_CONTENT, 'utf8');
}
