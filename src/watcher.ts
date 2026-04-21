/**
 * File watcher for KimiGraph.
 * Uses fs.watch (no dependencies) with debounced auto-sync.
 *
 * Pattern: File saved → mark dirty → debounce 2s → sync
 * Reference: KiroGraph's hook-based sync, adapted for standalone use.
 */

import * as fs from 'fs';
import * as path from 'path';

const WATCH_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py',
  '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx',
  '.cs',
]);

export interface WatcherOptions {
  debounceMs?: number;
}

export class GraphWatcher {
  private projectRoot: string;
  private onSync: () => void | Promise<void>;
  private debounceMs: number;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(
    projectRoot: string,
    onSync: () => void | Promise<void>,
    opts: WatcherOptions = {}
  ) {
    this.projectRoot = projectRoot;
    this.onSync = onSync;
    this.debounceMs = opts.debounceMs ?? 2000;
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

          // Ignore changes inside .kimigraph/
          if (filename.includes('.kimigraph')) return;

          this.markDirty();
        }
      );
    } catch {
      // fs.watch recursive may not work on all platforms
      // Fallback: silently skip watcher
    }
  }

  /** Stop watching and clear pending sync. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.dirty = false;
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
      } catch {
        // If sync fails, mark dirty again to retry later
        this.dirty = true;
      }
    }, this.debounceMs);
  }
}
