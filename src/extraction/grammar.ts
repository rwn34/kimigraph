/**
 * Tree-sitter grammar loading and management.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Language, Parser, Query } from 'web-tree-sitter';
import { Language as KimiGraphLanguage } from '../types';
import { logDebug } from '../errors';

function getGrammarDir(): string {
  // Try require.resolve first for installed packages
  try {
    const modPath = require.resolve('tree-sitter-wasms/package.json');
    const dir = path.join(path.dirname(modPath), 'out');
    if (fs.existsSync(dir)) return dir;
  } catch {
    // fall through
  }

  const candidates = [
    path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out'),
    path.join(__dirname, '..', '..', '..', 'node_modules', 'tree-sitter-wasms', 'out'),
    path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

const LANGUAGE_MAP: Record<KimiGraphLanguage, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
};

const loadedLanguages = new Map<KimiGraphLanguage, Language>();
let parserInitDone = false;

export async function initGrammars(): Promise<void> {
  if (parserInitDone) return;
  await Parser.init();
  parserInitDone = true;
  logDebug('Tree-sitter parser initialized');
}

export async function loadGrammar(lang: KimiGraphLanguage): Promise<Language> {
  await initGrammars();

  if (loadedLanguages.has(lang)) {
    return loadedLanguages.get(lang)!;
  }

  const wasmFile = LANGUAGE_MAP[lang];
  const grammarDir = getGrammarDir();
  let wasmPath = path.join(grammarDir, wasmFile);

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Grammar WASM not found: ${wasmPath} for language ${lang}`);
  }

  logDebug('Loading grammar:', wasmPath);
  const language = await Language.load(wasmPath);
  loadedLanguages.set(lang, language);
  return language;
}

export function getGrammar(lang: KimiGraphLanguage): Language | null {
  return loadedLanguages.get(lang) ?? null;
}

export function isGrammarLoaded(lang: KimiGraphLanguage): boolean {
  return loadedLanguages.has(lang);
}

export async function loadGrammarsForLanguages(
  languages: KimiGraphLanguage[]
): Promise<void> {
  await Promise.all(languages.map((lang) => loadGrammar(lang)));
}

export function getSupportedLanguages(): KimiGraphLanguage[] {
  return Object.keys(LANGUAGE_MAP) as KimiGraphLanguage[];
}

export function loadQuery(language: Language, queryPath: string): Query {
  if (!fs.existsSync(queryPath)) {
    throw new Error(`Query file not found: ${queryPath}`);
  }
  const querySource = fs.readFileSync(queryPath, 'utf8');
  return new Query(language, querySource);
}
