import { describe, it, expect, beforeAll } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'graph');

describe('Graph Traversal', () => {
  beforeAll(async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'chain.ts'),
      `export function a() { return b(); }\nexport function b() { return c(); }\nexport function c() { return 1; }\n`,
      'utf8'
    );
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();
    kg.close();
  });

  it('finds callees', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const aNode = (await kg.searchNodes('a', { limit: 5 }))[0]?.node;
    expect(aNode).toBeDefined();

    const callees = kg.getCallees(aNode.id, 10);
    const names = callees.map((n) => n.name);
    expect(names).toContain('b');

    kg.close();
  });

  it('finds callers', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const bNode = (await kg.searchNodes('b', { limit: 5 }))[0]?.node;
    expect(bNode).toBeDefined();

    const callers = kg.getCallers(bNode.id, 10);
    const names = callers.map((n) => n.name);
    expect(names).toContain('a');

    kg.close();
  });

  it('finds impact radius', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const cNode = (await kg.searchNodes('c', { limit: 5 }))[0]?.node;
    expect(cNode).toBeDefined();

    // Debug: log impacted nodes
    const impactedC = kg.getImpactRadius(cNode.id, 3);
    console.log('impactedC:', impactedC.map((n) => `${n.kind}:${n.name}`));

    // c is a leaf — callers are b and a (2 hops up the chain)
    // (actual count may include file nodes depending on extraction)
    expect(impactedC.length).toBeGreaterThanOrEqual(2);

    // a is at the top — nobody calls it, so reverse impact is 0
    const aNode = (await kg.searchNodes('a', { limit: 5 }))[0]?.node;
    const impactedA = kg.getImpactRadius(aNode.id, 3);
    expect(impactedA.length).toBe(0);

    kg.close();
  });

  it('finds paths between nodes', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const aNode = (await kg.searchNodes('a', { limit: 5 }))[0]?.node;
    const cNode = (await kg.searchNodes('c', { limit: 5 }))[0]?.node;
    expect(aNode).toBeDefined();
    expect(cNode).toBeDefined();

    const pathResult = kg.findPath(aNode.id, cNode.id);
    expect(pathResult.nodes.length).toBeGreaterThanOrEqual(2);

    kg.close();
  });
});
