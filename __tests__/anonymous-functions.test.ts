import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSource } from '../src/extraction/index';
import { initGrammars } from '../src/extraction/grammar';

describe('Anonymous function detection', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('detects arrow function callbacks in TypeScript', async () => {
    const code = `
function processItems(items: number[]) {
  return items.map(x => x * 2);
}
`;
    const result = await extractFromSource('anon.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('attributes calls inside arrow functions to the anonymous function', async () => {
    const code = `
function outer() {
  const arr = [1, 2];
  arr.map(x => helper(x));
}

function helper(v: number) { return v; }
`;
    const result = await extractFromSource('nested.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();

    // The call to helper should be attributed to the anonymous function, not outer
    const helperCall = result.unresolvedRefs.find((r) => r.refName === 'helper');
    expect(helperCall).toBeDefined();
    expect(helperCall!.sourceId).toBe(anon!.id);
  });

  it('detects Python lambdas', async () => {
    const code = `
add = lambda a, b: a + b
result = add(1, 2)
`;
    const result = await extractFromSource('lambda.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('detects Java lambdas', async () => {
    const code = `
import java.util.List;
class A {
  void m() {
    List.of(1,2).forEach(x -> System.out.println(x));
  }
}
`;
    const result = await extractFromSource('Lambda.java', code, 'java');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('detects Go function literals', async () => {
    const code = `
package main
func main() {
  f := func() { println("hi") }
  f()
}
`;
    const result = await extractFromSource('anon.go', code, 'go');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('detects Rust closures', async () => {
    const code = `
fn main() {
  let f = |x: i32| x + 1;
  println!("{}", f(5));
}
`;
    const result = await extractFromSource('closure.rs', code, 'rust');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('detects C++ lambdas', async () => {
    const code = `
#include <vector>
int main() {
  auto f = []() { return 42; };
  return f();
}
`;
    const result = await extractFromSource('lambda.cpp', code, 'cpp');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });

  it('detects C# lambdas', async () => {
    const code = `
using System;
class A {
  void M() {
    Func<int, int> f = x => x + 1;
    Console.WriteLine(f(5));
  }
}
`;
    const result = await extractFromSource('Lambda.cs', code, 'csharp');
    expect(result.errors).toHaveLength(0);

    const anon = result.nodes.find((n) => n.name.startsWith('anonymous_at_line_'));
    expect(anon).toBeDefined();
    expect(anon!.kind).toBe('function');
  });
});
