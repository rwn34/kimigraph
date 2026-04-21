/**
 * Shared utilities for KimiGraph.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// HASHING
// ============================================================================

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// ============================================================================
// PATH RESOLUTION (works both bundled and unbundled)
// ============================================================================

/**
 * Resolve a file path that works both in development (src/) and bundled (dist/) contexts.
 * Tries multiple candidate paths and returns the first existing one.
 */
export function resolveAsset(...relativePaths: string[]): string {
  const candidates: string[] = [];

  // When bundled, __dirname is dist/bin/ or dist/
  // Try relative to the bundle first
  candidates.push(path.join(__dirname, ...relativePaths));
  candidates.push(path.join(__dirname, '..', ...relativePaths));
  candidates.push(path.join(__dirname, '..', '..', 'src', ...relativePaths));
  candidates.push(path.join(process.cwd(), 'src', ...relativePaths));
  candidates.push(path.join(process.cwd(), ...relativePaths));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Return the most likely path even if it doesn't exist (caller will handle error)
  return path.join(__dirname, ...relativePaths);
}

// ============================================================================
// PATH VALIDATION
// ============================================================================

export function validatePathWithinRoot(
  targetPath: string,
  projectRoot: string
): string | null {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(projectRoot);
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

export function isExcludedPath(
  filePath: string,
  excludePatterns: string[]
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of excludePatterns) {
    const regex = globToRegex(pattern);
    if (regex.test(normalized)) {
      return true;
    }
  }
  return false;
}

function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  if (regex.endsWith('/.*')) {
    regex = regex.slice(0, -3) + '(?:/.*)?';
  }
  return new RegExp(`^${regex}$`);
}

// ============================================================================
// FILE UTILITIES
// ============================================================================

export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could',
  'should','may','might','must','shall','can','need','dare',
  'ought','used','to','of','in','for','on','with','at','by',
  'from','as','into','through','during','before','after',
  'above','below','between','under','and','but','or','yet',
  'so','if','because','although','though','while','where',
  'when','that','which','who','whom','whose','what','how',
  'all','each','every','both','few','more','most','other',
  'some','such','no','nor','not','only','own','same','than',
  'too','very','just','now','then','here','there','up','out',
  'if','about','against','down','off','over','again','further',
  'once','it','its','itself','they','them','their','theirs',
  'themselves','i','me','my','myself','we','our','ours','ourselves',
  'you','your','yours','yourself','yourselves','he','him','his',
  'himself','she','her','hers','herself','this','these','those',
  'am','get','got','go','going','gone','make','made','take',
  'took','come','came','see','saw','know','knew','think','thought',
  'use','look','find','give','tell','ask','seem','feel','try',
  'leave','call','work','need','want','like','help','show','play',
  'move','live','believe','bring','happen','write','provide','sit',
  'stand','lose','add','spend','build','stay','fall','cut','reach',
  'kill','remain','does','way','number','say','man','trying','able',
  'able','last','long','great','little','own','other','old','right',
  'big','high','different','small','large','next','early','young',
  'important','few','public','bad','same','able'
]);

export function extractSymbolTokens(text: string): string[] {
  const tokens: string[] = [];

  // Code-style identifiers
  const camelMatches = text.match(/\b[A-Z][a-zA-Z0-9]*[a-z]+[A-Z][a-zA-Z0-9]*\b/g);
  if (camelMatches) tokens.push(...camelMatches);

  const snakeMatches = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g);
  if (snakeMatches) tokens.push(...snakeMatches);

  const screamingMatches = text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g);
  if (screamingMatches) tokens.push(...screamingMatches);

  const dotMatches = text.match(/\b[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+\b/g);
  if (dotMatches) tokens.push(...dotMatches);

  // Fallback: any word 3+ chars that isn't a stop word
  const wordMatches = text.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,}\b/g);
  if (wordMatches) {
    for (const w of wordMatches) {
      if (!STOP_WORDS.has(w.toLowerCase())) {
        tokens.push(w);
      }
    }
  }

  const seen = new Set<string>();
  return tokens.filter((t) => {
    const lower = t.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

// ============================================================================
// DEBOUNCE
// ============================================================================

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ============================================================================
// MUTEX
// ============================================================================

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }
}
