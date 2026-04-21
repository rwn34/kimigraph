import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSource } from '../src/extraction/index';
import { initGrammars, loadGrammar } from '../src/extraction/grammar';
import { Parser, Query } from 'web-tree-sitter';

describe('Extraction debug', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('shows raw captures', async () => {
    const code = `function hello(name: string): string { return name; }`;
    const grammar = await loadGrammar('typescript');
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(code);

    const query = new Query(grammar, '(function_declaration name: (identifier) @function.name) @function.definition');
    const captures = query.captures(tree.rootNode);

    console.log('Raw captures count:', captures.length);
    for (const c of captures) {
      console.log('Capture:', c.name, '=>', c.node.type, c.node.text.slice(0, 30));
    }

    expect(captures.length).toBeGreaterThan(0);
  });
});
