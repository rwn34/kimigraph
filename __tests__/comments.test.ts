import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSource } from '../src/extraction/index';
import { initGrammars } from '../src/extraction/grammar';

describe('Comment extraction', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('indexes line and block comments in TypeScript', async () => {
    const code = `
// This is a line comment
function hello(): string {
  /* inline block */
  return 'hi';
}
/*
 * Multi-line block
 */
`;
    const result = await extractFromSource('comments.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const comments = result.nodes.filter((n) => n.kind === 'comment');
    expect(comments.length).toBeGreaterThanOrEqual(3);

    const lineComment = comments.find((c) => c.name.includes('line comment'));
    expect(lineComment).toBeDefined();
    expect(lineComment!.docstring).toContain('line comment');

    const blockComment = comments.find((c) => c.name.includes('Multi-line'));
    expect(blockComment).toBeDefined();
    expect(blockComment!.docstring).toContain('Multi-line');
  });

  it('indexes Python comments', async () => {
    const code = `
# module doc
import os

def foo():
    # inside function
    pass
`;
    const result = await extractFromSource('comments.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const comments = result.nodes.filter((n) => n.kind === 'comment');
    expect(comments.length).toBeGreaterThanOrEqual(2);

    expect(comments.some((c) => c.docstring?.includes('module doc'))).toBe(true);
    expect(comments.some((c) => c.docstring?.includes('inside function'))).toBe(true);
  });

  it('indexes Java comments', async () => {
    const code = `
// line comment
class A {
  /* block */
  void m() {}
}
`;
    const result = await extractFromSource('Comments.java', code, 'java');
    expect(result.errors).toHaveLength(0);

    const comments = result.nodes.filter((n) => n.kind === 'comment');
    expect(comments.length).toBeGreaterThanOrEqual(2);
  });

  it('stores full comment text in docstring for FTS search', async () => {
    const code = `// TODO: refactor authentication logic`;
    const result = await extractFromSource('todo.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const comment = result.nodes.find((n) => n.kind === 'comment');
    expect(comment).toBeDefined();
    expect(comment!.docstring).toContain('TODO');
    expect(comment!.docstring).toContain('refactor');
  });
});
