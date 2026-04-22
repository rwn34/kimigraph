import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ffi-js');

describe('Cross-language FFI detection', () => {
  let kg: KimiGraph | null = null;

  beforeEach(async () => {
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
    const initKg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await initKg.indexAll();
    initKg.close();
  });

  afterEach(() => {
    kg?.close();
    kg = null;
  });

  it('detects WASM imports as FFI edges', async () => {
    kg = await KimiGraph.open(FIXTURE_DIR);

    const stats = kg.getStats();
    console.log('Stats:', stats);

    // Find the math.wasm file node
    const wasmNodes = await kg.searchNodes('math.wasm', { limit: 5 });
    const wasmNode = wasmNodes.find((n) => n.node.kind === 'file')?.node;
    expect(wasmNode).toBeDefined();

    // Impact radius on math.wasm should include main.ts (who imports it)
    const impacted = kg.getImpactRadius(wasmNode!.id, 2);
    const impactedNames = impacted.map((n) => n.name);
    expect(impactedNames).toContain('main.ts');

    // Path from main.ts to math.wasm should exist via ffi edge
    const mainNodes = await kg.searchNodes('main.ts', { limit: 5 });
    const mainNode = mainNodes.find((n) => n.node.kind === 'file')?.node;
    expect(mainNode).toBeDefined();

    const pathResult = kg.findPath(mainNode!.id, wasmNode!.id);
    expect(pathResult.nodes.length).toBeGreaterThanOrEqual(2);
    expect(pathResult.edges.some((e) => e.kind === 'ffi')).toBe(true);
  });

  it('detects Node-API require as FFI edges', async () => {
    kg = await KimiGraph.open(FIXTURE_DIR);

    // Find the native.node file node
    const nativeNodes = await kg.searchNodes('native.node', { limit: 5 });
    const nativeNode = nativeNodes.find((n) => n.node.kind === 'file')?.node;
    expect(nativeNode).toBeDefined();

    // Impact radius on native.node should include main.ts (who requires it)
    const impacted = kg.getImpactRadius(nativeNode!.id, 2);
    const impactedNames = impacted.map((n) => n.name);
    expect(impactedNames).toContain('main.ts');
  });
});
