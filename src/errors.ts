/**
 * Error classes and logging for KimiGraph.
 */

export class KimiGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KimiGraphError';
  }
}

export class DatabaseError extends KimiGraphError {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Database error: ${message}`);
    this.name = 'DatabaseError';
  }
}

export class ParseError extends KimiGraphError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line?: number
  ) {
    super(`Parse error in ${filePath}${line ? `:${line}` : ''}: ${message}`);
    this.name = 'ParseError';
  }
}

export class ConfigError extends KimiGraphError {
  constructor(message: string) {
    super(`Config error: ${message}`);
    this.name = 'ConfigError';
  }
}

export class SearchError extends KimiGraphError {
  constructor(message: string) {
    super(`Search error: ${message}`);
    this.name = 'SearchError';
  }
}

// ============================================================================
// LOGGING
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLogLevel: LogLevel = 'warn';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLogLevel];
}

export function logDebug(message: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.error(`[kimigraph:debug] ${message}`, ...args);
  }
}

export function logInfo(message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.error(`[kimigraph:info] ${message}`, ...args);
  }
}

export function logWarn(message: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.error(`[kimigraph:warn] ${message}`, ...args);
  }
}

export function logError(message: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(`[kimigraph:error] ${message}`, ...args);
  }
}
