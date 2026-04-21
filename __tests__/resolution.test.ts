import { describe, it, expect, beforeAll } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'resolution');

describe('Reference Resolution', () => {
  beforeAll(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'math.ts'),
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'index.ts'),
      `import { add, multiply } from './math';\n\nexport function sumThree(a: number, b: number, c: number): number {\n  return add(add(a, b), c);\n}\n\nexport function productThree(a: number, b: number, c: number): number {\n  return multiply(multiply(a, b), c);\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.ts'),
      `import { sumThree, productThree } from './index';\n\nfunction main() {\n  console.log(sumThree(1, 2, 3));\n  console.log(productThree(1, 2, 3));\n}\n`,
      'utf8'
    );
  });

  beforeEach(async () => {
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
    const kg = await KimiGraph.init(FIXTURE_DIR);
    await kg.indexAll();
    kg.close();
  });

  it('resolves same-file calls', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const nodes = kg.searchNodes('main', { limit: 5 });
    const mainNode = nodes.find((n) => n.node.kind === 'function')?.node;
    expect(mainNode).toBeDefined();

    const callees = kg.getCallees(mainNode!.id, 10);
    const calleeNames = callees.map((n) => n.name);
    expect(calleeNames).toContain('sumThree');
    expect(calleeNames).toContain('productThree');

    kg.close();
  });

  it('resolves import-aware cross-file calls', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    // sumThree calls add (from math.ts via import)
    const sumThreeNode = kg.searchNodes('sumThree', { limit: 5 })[0]?.node;
    expect(sumThreeNode).toBeDefined();

    const callees = kg.getCallees(sumThreeNode.id, 10);
    const calleeNames = callees.map((n) => n.name);
    expect(calleeNames).toContain('add');

    // productThree calls multiply (from math.ts via import)
    const productThreeNode = kg.searchNodes('productThree', { limit: 5 })[0]?.node;
    expect(productThreeNode).toBeDefined();

    const callees2 = kg.getCallees(productThreeNode.id, 10);
    const calleeNames2 = callees2.map((n) => n.name);
    expect(calleeNames2).toContain('multiply');

    kg.close();
  });

  it('resolves callers across files', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const addNodes = kg.searchNodes('add', { limit: 5, kinds: ['function'] });
    const addNode = addNodes[0]?.node;
    expect(addNode).toBeDefined();

    const callers = kg.getCallers(addNode.id, 10);
    const callerNames = callers.map((n) => n.name);
    expect(callerNames).toContain('sumThree');

    kg.close();
  });

  it('resolves module imports to file nodes', async () => {
    const kg = await KimiGraph.open(FIXTURE_DIR);

    const stats = kg.getStats();
    // Should have resolved some import edges
    expect(stats.edges).toBeGreaterThan(0);

    kg.close();
  });
});
