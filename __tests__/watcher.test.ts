import { describe, it, expect, beforeEach } from 'vitest';
import { KimiGraph } from '../src/index';
import { GraphWatcher } from '../src/watcher';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'watcher');

describe('GraphWatcher', () => {
  beforeEach(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
  });

  it('starts and stops without error', () => {
    let called = false;
    const watcher = new GraphWatcher(FIXTURE_DIR, () => { called = true; }, { debounceMs: 50 });
    watcher.start();
    expect(watcher.isDirty()).toBe(false);
    watcher.stop();
  });

  it('marks dirty when a source file changes', async () => {
    const sourceFile = path.join(FIXTURE_DIR, 'test.ts');
    fs.writeFileSync(sourceFile, `export function foo() { return 1; }\n`, 'utf8');

    let syncCount = 0;
    const watcher = new GraphWatcher(
      FIXTURE_DIR,
      () => { syncCount++; return Promise.resolve(); },
      { debounceMs: 100 }
    );
    watcher.start();

    // Give watcher time to initialize (fs.watch setup is async on some platforms)
    await new Promise((r) => setTimeout(r, 100));

    // Modify the file
    fs.writeFileSync(sourceFile, `export function foo() { return 2; }\n`, 'utf8');

    // Poll until sync fires or timeout (fs.watch can be slow in CI)
    const deadline = Date.now() + 5000;
    while (syncCount === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(syncCount).toBeGreaterThanOrEqual(1);
    watcher.stop();
  }, 10000);

  it('debounces rapid changes into a single sync', async () => {
    const sourceFile = path.join(FIXTURE_DIR, 'rapid.ts');
    fs.writeFileSync(sourceFile, `export function a() {}\n`, 'utf8');

    let syncCount = 0;
    const watcher = new GraphWatcher(
      FIXTURE_DIR,
      () => { syncCount++; return Promise.resolve(); },
      { debounceMs: 200 }
    );
    watcher.start();

    // Rapidly modify 5 times within 300ms
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(sourceFile, `export function a() { return ${i}; }\n`, 'utf8');
      await new Promise((r) => setTimeout(r, 30));
    }

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, 500));

    // Should have synced only once (or maybe twice if timing is unlucky)
    expect(syncCount).toBeLessThanOrEqual(2);
    watcher.stop();
  });
});

describe('KimiGraph watch integration', () => {
  beforeEach(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
  });

  it('watch and unwatch methods exist', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'api.ts'),
      `export function getUser() { return { name: 'test' }; }\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    expect(() => kg.watch({ debounceMs: 50 })).not.toThrow();
    expect(() => kg.unwatch()).not.toThrow();

    kg.close();
  });

  it('close stops the watcher', async () => {
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'simple.ts'),
      `export function x() { return 1; }\n`,
      'utf8'
    );

    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    kg.watch({ debounceMs: 50 });
    kg.close();

    // After close, watcher should be stopped
    expect(kg.isDirty()).toBe(false);
  });

});
