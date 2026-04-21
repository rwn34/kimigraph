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

const AGENTS_MD_CONTENT = `# KimiGraph Agent Instructions

This project has KimiGraph initialized (\`.kimigraph/\` exists).

## When Exploring Code

**Use \`kimigraph_explore\` as your PRIMARY tool** for any broad codebase question:
- "How does X work?"
- "Trace the Y flow"
- "Where is Z implemented?"
- "Explain the architecture of Z"

This tool returns full source sections for all relevant symbols in ONE call. You do NOT need to read individual files for exploration.

## For Targeted Lookups (Before Editing)

Use these lightweight tools directly:

| Tool | Use For |
|------|---------|
| \`kimigraph_search\` | Find symbols by name |
| \`kimigraph_callers\` / \`kimigraph_callees\` | Trace call flow |
| \`kimigraph_impact\` | Check what is affected before editing |
| \`kimigraph_node\` | Get a single symbol's details + source |

## Do NOT

- Use \`Grep\` or \`Glob\` to find symbols — \`kimigraph_search\` is faster and more accurate
- Use \`ReadFile\` to explore architecture — \`kimigraph_explore\` already returns full source
- Run \`kimigraph init\` or \`kimigraph index\` unless the user explicitly asks

## If \`.kimigraph/\` Does NOT Exist

Ask the user: "Would you like me to run \`kimigraph init\` to build a code knowledge graph?"
`;

export function writeAgentInstructions(projectRoot: string): void {
  const kimiDir = path.join(projectRoot, '.kimi');
  fs.mkdirSync(kimiDir, { recursive: true });
  const instructionsPath = path.join(kimiDir, 'AGENTS.md');
  fs.writeFileSync(instructionsPath, AGENTS_MD_CONTENT, 'utf8');
}
