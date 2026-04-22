import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'resolution-non-js');

describe('Non-JS resolution', () => {
  let kg: KimiGraph;

  beforeAll(async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });

    // Python: main.py imports helper from utils
    fs.mkdirSync(path.join(FIXTURE_DIR, 'utils'), { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.py'),
      `from utils import helper\n\ndef main():\n    helper()\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'utils', '__init__.py'),
      `def helper():\n    pass\n`,
      'utf8'
    );

    // Go: main.go imports local package
    fs.mkdirSync(path.join(FIXTURE_DIR, 'goproj', 'pkg'), { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'goproj', 'main.go'),
      `package main\n\nimport "./pkg"\n\nfunc main() {\n    pkg.Foo()\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'goproj', 'pkg', 'foo.go'),
      `package pkg\n\nfunc Foo() {}\n`,
      'utf8'
    );

    kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();
  }, 30000);

  afterAll(() => {
    kg.close();
  });

  it('resolves Python cross-file calls via import map', async () => {
    const results = await kg.searchNodes('helper');
    const helperNode = results.find((r) => r.node.name === 'helper');
    expect(helperNode).toBeDefined();
    // helper is called from main() in main.py
    const callers = kg.getCallers(helperNode!.node.id);
    expect(callers.length).toBeGreaterThan(0);
  });

  it('resolves Go cross-package calls via import map', async () => {
    const results = await kg.searchNodes('Foo');
    const fooNode = results.find((r) => r.node.name === 'Foo');
    expect(fooNode).toBeDefined();
    // Foo should have a caller from main.go
    const callers = kg.getCallers(fooNode!.node.id);
    expect(callers.length).toBeGreaterThan(0);
  });
});
