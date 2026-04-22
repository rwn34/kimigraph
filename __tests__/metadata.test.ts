import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSource } from '../src/extraction/index';
import { initGrammars } from '../src/extraction/grammar';

describe('Metadata extraction', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('detects exported functions in TypeScript', async () => {
    const code = `export async function foo() {}`;
    const result = await extractFromSource('meta.ts', code, 'typescript');
    const fn = result.nodes.find((n) => n.name === 'foo');
    expect(fn).toBeDefined();
    expect(fn!.isExported).toBe(true);
    expect(fn!.isAsync).toBe(true);
  });

  it('detects static and abstract methods in TypeScript', async () => {
    const code = `
class A {
  static async foo() {}
  abstract bar(): void;
}
`;
    const result = await extractFromSource('meta.ts', code, 'typescript');
    const foo = result.nodes.find((n) => n.name === 'foo');
    expect(foo).toBeDefined();
    expect(foo!.isStatic).toBe(true);
    expect(foo!.isAsync).toBe(true);
  });

  it('builds qualifiedName for methods', async () => {
    const code = `
class Greeter {
  greet(name: string): void {}
}
`;
    const result = await extractFromSource('meta.ts', code, 'typescript');
    const method = result.nodes.find((n) => n.name === 'greet');
    expect(method).toBeDefined();
    expect(method!.qualifiedName).toBe('Greeter.greet');
  });

  it('extracts function signatures', async () => {
    const code = `function greet(name: string, age: number): string {}`;
    const result = await extractFromSource('meta.ts', code, 'typescript');
    const fn = result.nodes.find((n) => n.name === 'greet');
    expect(fn).toBeDefined();
    expect(fn!.signature).toBe('(name: string, age: number)');
  });

  it('detects public classes and methods in Java', async () => {
    const code = `
public class User {
  public String getName() { return ""; }
}
`;
    const result = await extractFromSource('User.java', code, 'java');
    const cls = result.nodes.find((n) => n.name === 'User');
    expect(cls).toBeDefined();
    expect(cls!.isExported).toBe(true);
    const method = result.nodes.find((n) => n.name === 'getName');
    expect(method).toBeDefined();
    expect(method!.isExported).toBe(true);
  });

  it('detects Rust pub functions', async () => {
    const code = `pub fn foo() {}`;
    const result = await extractFromSource('meta.rs', code, 'rust');
    const fn = result.nodes.find((n) => n.name === 'foo');
    expect(fn).toBeDefined();
    expect(fn!.isExported).toBe(true);
  });

  it('detects Go exported functions by capitalization', async () => {
    const code = `
func Foo() {}
func bar() {}
`;
    const result = await extractFromSource('meta.go', code, 'go');
    const foo = result.nodes.find((n) => n.name === 'Foo');
    const bar = result.nodes.find((n) => n.name === 'bar');
    expect(foo!.isExported).toBe(true);
    expect(bar!.isExported).toBeFalsy();
  });

  it('detects Python exported functions by convention (no leading underscore)', async () => {
    const code = `
def public_func():
    pass

def _private_func():
    pass
`;
    const result = await extractFromSource('meta.py', code, 'python');
    const pub = result.nodes.find((n) => n.name === 'public_func');
    const priv = result.nodes.find((n) => n.name === '_private_func');
    expect(pub).toBeDefined();
    expect(priv).toBeDefined();
    expect(pub!.isExported).toBe(true);
    expect(priv!.isExported).toBe(false);
  });
});

describe('Inheritance edges', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts extends and implements in TypeScript', async () => {
    const code = `
class Animal {}
interface CanFly {}
class Bird extends Animal implements CanFly {}
`;
    const result = await extractFromSource('inherit.ts', code, 'typescript');
    const edges = result.edges;
    expect(edges.some((e) => e.kind === 'extends' && e.source.includes('Bird'))).toBe(true);
    expect(edges.some((e) => e.kind === 'implements' && e.source.includes('Bird'))).toBe(true);
  });

  it('extracts extends in Java', async () => {
    const code = `
class Animal {}
class Dog extends Animal {}
`;
    const result = await extractFromSource('inherit.java', code, 'java');
    const edges = result.edges;
    expect(edges.some((e) => e.kind === 'extends' && e.source.includes('Dog'))).toBe(true);
  });

  it('extracts implements in Java', async () => {
    const code = `
interface Flyer {}
class Bird implements Flyer {}
`;
    const result = await extractFromSource('inherit.java', code, 'java');
    const edges = result.edges;
    expect(edges.some((e) => e.kind === 'implements' && e.source.includes('Bird'))).toBe(true);
  });
});

describe('Enum extraction', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts Java enums and members', async () => {
    const code = `enum Color { RED, GREEN, BLUE }`;
    const result = await extractFromSource('enum.java', code, 'java');
    const enumNode = result.nodes.find((n) => n.kind === 'enum');
    expect(enumNode).toBeDefined();
    expect(enumNode!.name).toBe('Color');
    const members = result.nodes.filter((n) => n.kind === 'enum_member');
    expect(members.length).toBe(3);
    expect(members.map((m) => m.name)).toContain('RED');
  });

  it('extracts C# enums and members', async () => {
    const code = `enum Color { Red, Green, Blue }`;
    const result = await extractFromSource('enum.cs', code, 'csharp');
    const enumNode = result.nodes.find((n) => n.kind === 'enum');
    expect(enumNode).toBeDefined();
    expect(enumNode!.name).toBe('Color');
    const members = result.nodes.filter((n) => n.kind === 'enum_member');
    expect(members.length).toBe(3);
  });

  it('extracts Rust enums and variants', async () => {
    const code = `enum Color { Red, Green, Blue }`;
    const result = await extractFromSource('enum.rs', code, 'rust');
    const enumNode = result.nodes.find((n) => n.kind === 'enum');
    expect(enumNode).toBeDefined();
    expect(enumNode!.name).toBe('Color');
    const members = result.nodes.filter((n) => n.kind === 'enum_member');
    expect(members.length).toBe(3);
  });
});

describe('Property and constant extraction', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts TypeScript class properties', async () => {
    const code = `class A { name: string; public age = 30; }`;
    const result = await extractFromSource('prop.ts', code, 'typescript');
    const props = result.nodes.filter((n) => n.kind === 'property');
    expect(props.length).toBe(2);
    expect(props.map((p) => p.name)).toContain('name');
    expect(props.map((p) => p.name)).toContain('age');
  });

  it('extracts Java fields as properties', async () => {
    const code = `class A { private String name; public int age = 30; }`;
    const result = await extractFromSource('prop.java', code, 'java');
    const props = result.nodes.filter((n) => n.kind === 'property');
    expect(props.length).toBe(2);
    expect(props.map((p) => p.name)).toContain('name');
  });

  it('extracts C# properties', async () => {
    const code = `class A { public string Name { get; set; } public int age; }`;
    const result = await extractFromSource('prop.cs', code, 'csharp');
    const props = result.nodes.filter((n) => n.kind === 'property');
    expect(props.length).toBe(2);
    expect(props.map((p) => p.name)).toContain('Name');
    expect(props.map((p) => p.name)).toContain('age');
  });

  it('extracts Rust constants', async () => {
    const code = `const MAX_SIZE: usize = 100;`;
    const result = await extractFromSource('const.rs', code, 'rust');
    const constNode = result.nodes.find((n) => n.kind === 'constant');
    expect(constNode).toBeDefined();
    expect(constNode!.name).toBe('MAX_SIZE');
  });

  it('extracts Go constants', async () => {
    const code = `const MaxSize = 100`;
    const result = await extractFromSource('const.go', code, 'go');
    const constNode = result.nodes.find((n) => n.kind === 'constant');
    expect(constNode).toBeDefined();
    expect(constNode!.name).toBe('MaxSize');
  });
});

describe('Python methods', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts methods inside classes as method kind', async () => {
    const code = `
class Greeter:
    def greet(self, name):
        print(name)
`;
    const result = await extractFromSource('methods.py', code, 'python');
    const method = result.nodes.find((n) => n.name === 'greet');
    expect(method).toBeDefined();
    expect(method!.kind).toBe('method');
    expect(method!.qualifiedName).toBe('Greeter.greet');
  });
});

describe('Go variables', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts Go var declarations', async () => {
    const code = `var x = 1`;
    const result = await extractFromSource('vars.go', code, 'go');
    const varNode = result.nodes.find((n) => n.name === 'x');
    expect(varNode).toBeDefined();
    expect(varNode!.kind).toBe('variable');
  });
});
