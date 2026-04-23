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
    fs.mkdirSync(path.join(FIXTURE_DIR, 'other'), { recursive: true });
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
    // Second helper in another package — should NOT be resolved for main.py
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'other', '__init__.py'),
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

    // Java: Main.java imports Helper from com.example package
    fs.mkdirSync(path.join(FIXTURE_DIR, 'com', 'example'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURE_DIR, 'com', 'other'), { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'com', 'example', 'Helper.java'),
      `package com.example;\n\npublic class Helper {\n    public static void help() {}\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'com', 'other', 'Helper.java'),
      `package com.other;\n\npublic class Helper {\n    public static void help() {}\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'Main.java'),
      `import com.example.Helper;\n\npublic class Main {\n    public static void main(String[] args) {\n        Helper.help();\n    }\n}\n`,
      'utf8'
    );

    // Rust: main.rs uses crate::helper::assist
    fs.mkdirSync(path.join(FIXTURE_DIR, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'src', 'helper.rs'),
      `pub fn assist() {}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'src', 'other.rs'),
      `pub fn assist() {}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'src', 'main.rs'),
      `use crate::helper::assist;\n\nfn main() {\n    assist();\n}\n`,
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
    // There are two helper functions; pick the one from utils
    const utilsHelper = results.find((r) => r.node.name === 'helper' && r.node.filePath === 'utils/__init__.py');
    expect(utilsHelper).toBeDefined();
    // utils.helper is called from main() in main.py
    const callers = kg.getCallers(utilsHelper!.node.id);
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

  it('resolves Java cross-file calls via import-aware path (not project-unique fallback)', async () => {
    const results = await kg.searchNodes('help');
    // Two help() methods exist; pick the one from com.example
    const exampleHelp = results.find(
      (r) => r.node.name === 'help' && r.node.filePath === 'com/example/Helper.java'
    );
    expect(exampleHelp).toBeDefined();
    // com.example.Helper.help should have a caller from Main.java
    const callers = kg.getCallers(exampleHelp!.node.id);
    expect(callers.length).toBeGreaterThan(0);
  });

  it('resolves Rust cross-module calls via crate:: path (not project-unique fallback)', async () => {
    const results = await kg.searchNodes('assist');
    // Two assist() functions exist; pick the one from helper.rs
    const helperAssist = results.find(
      (r) => r.node.name === 'assist' && r.node.filePath === 'src/helper.rs'
    );
    expect(helperAssist).toBeDefined();
    // crate::helper::assist should have a caller from main.rs
    const callers = kg.getCallers(helperAssist!.node.id);
    expect(callers.length).toBeGreaterThan(0);
  });
});
