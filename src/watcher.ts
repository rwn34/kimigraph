/**
 * File watcher for KimiGraph.
 * Uses fs.watch (no dependencies) with debounced auto-sync.
 *
 * Pattern: File saved → mark dirty → debounce 2s → sync
 * Falls back to polling mode (dirty flag) if fs.watch is unsupported.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logWarn } from './errors';
import { isExcludedPath } from './utils';

const WATCH_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py',
  '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx',
  '.cs',
]);

const DEFAULT_EXCLUDES = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '__pycache__/**',
  '.venv/**',
  '.tox/**',
  'coverage/**',
  '.kimigraph/**',
  'target/**',
];

export interface WatcherOptions {
  debounceMs?: number;
  excludePatterns?: string[];
}

export class GraphWatcher {
  private projectRoot: string;
  private onSync: () => void | Promise<void>;
  private debounceMs: number;
  private excludePatterns: string[];
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(
    projectRoot: string,
    onSync: () => void | Promise<void>,
    opts: WatcherOptions = {}
  ) {
    this.projectRoot = projectRoot;
    this.onSync = onSync;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.excludePatterns = opts.excludePatterns ?? DEFAULT_EXCLUDES;
  }

  /** Start watching the project root recursively. */
  start(): void {
    this.stop();

    try {
      this.watcher = fs.watch(
        this.projectRoot,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename) return;

          const ext = path.extname(filename).toLowerCase();
          if (!WATCH_EXTENSIONS.has(ext)) return;

          const normalized = filename.replace(/\\/g, '/');

          if (isExcludedPath(normalized, this.excludePatterns)) {
            return;
          }

          this.markDirty();
        }
      );
    } catch (err) {
      // fs.watch recursive may not work on all platforms (Linux older kernels, network FS)
      logWarn('File watcher failed to start:', err instanceof Error ? err.message : String(err));
      logWarn('Falling back to polling mode — scanning file mtimes every 5s.');
      this.startPolling();
    }
  }

  /** Stop watching and clear pending sync. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.dirty = false;
  }

  private startPolling(): void {
    const snapshot = new Map<string, number>();
    this.scanFiles(snapshot);
    this.pollTimer = setInterval(() => {
      const current = new Map<string, number>();
      this.scanFiles(current);
      let changed = false;
      for (const [file, mtime] of current) {
        if (!snapshot.has(file) || snapshot.get(file) !== mtime) {
          changed = true;
          break;
        }
      }
      if (!changed && snapshot.size !== current.size) {
        changed = true;
      }
      if (changed) {
        this.dirty = true;
        this.scanFiles(snapshot); // update snapshot
      }
    }, 5000);
  }

  private scanFiles(out: Map<string, number>): void {
    const root = this.projectRoot;
    function walk(dir: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.kimigraph', 'target'].includes(entry.name)) {
            walk(full);
          }
        } else if (entry.isFile() && WATCH_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          try {
            const stat = fs.statSync(full);
            out.set(path.relative(root, full).replace(/\\/g, '/'), stat.mtimeMs);
          } catch { /* ignore */ }
        }
      }
    }
    walk(root);
  }

  /** Whether the graph is stale and needs sync. */
  isDirty(): boolean {
    return this.dirty;
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(async () => {
      this.dirty = false;
      try {
        await this.onSync();
      } catch (err) {
        logWarn('Sync failed:', err instanceof Error ? err.message : String(err));
        // If sync fails, mark dirty again to retry later
        this.dirty = true;
      }
    }, this.debounceMs);
  }
}
