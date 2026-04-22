import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../src/extraction';

describe('multi-line docstring extraction', () => {
  it('extracts JSDoc block comments for TypeScript functions', async () => {
    const code = `
/**
 * Compute the sum of two numbers.
 * @param a first number
 * @param b second number
 */
function add(a: number, b: number): number {
  return a + b;
}
`;
    const result = await extractFromSource('math.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('Compute the sum');
    expect(fn!.docstring).toContain('@param a');
    expect(fn!.docstring).toContain('@param b');
  });

  it('extracts multiple consecutive line comments for TypeScript', async () => {
    const code = `
// First line of docs
// Second line of docs
function bar() {}
`;
    const result = await extractFromSource('bar.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('First line of docs');
    expect(fn!.docstring).toContain('Second line of docs');
  });

  it('extracts Python docstrings from function body', async () => {
    const code = `
def greet(name):
    """Return a greeting for the given name."""
    return f"Hello, {name}!"
`;
    const result = await extractFromSource('greet.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('Return a greeting');
  });

  it('extracts multi-line Python docstrings', async () => {
    const code = `
def process(data):
    \"\"\"
    Process the input data.

    Returns the processed result.
    \"\"\"
    return data.upper()
`;
    const result = await extractFromSource('process.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('Process the input data');
    expect(fn!.docstring).toContain('Returns the processed result');
  });

  it('extracts Python class docstrings', async () => {
    const code = `
class Greeter:
    """A class that generates greetings."""
    pass
`;
    const result = await extractFromSource('greeter.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const cls = result.nodes.find((n) => n.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls!.docstring).toContain('generates greetings');
  });

  it('extracts Rust doc comments (///)', async () => {
    const code = `
/// Compute factorial
/// recursively
pub fn factorial(n: u64) -> u64 {
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}
`;
    const result = await extractFromSource('math.rs', code, 'rust');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('Compute factorial');
    expect(fn!.docstring).toContain('recursively');
  });

  it('extracts Go doc comments (//)', async () => {
    const code = `
// Add returns the sum of a and b.
// It is a simple arithmetic operation.
func Add(a, b int) int {
	return a + b
}
`;
    const result = await extractFromSource('math.go', code, 'go');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('Add returns the sum');
    expect(fn!.docstring).toContain('simple arithmetic operation');
  });

  it('extracts Java Javadoc comments', async () => {
    const code = `
public class Math {
    /**
     * Returns the maximum of two integers.
     * @param a first value
     * @param b second value
     */
    public static int max(int a, int b) {
        return a > b ? a : b;
    }
}
`;
    const result = await extractFromSource('Math.java', code, 'java');
    expect(result.errors).toHaveLength(0);

    const method = result.nodes.find((n) => n.kind === 'method');
    expect(method).toBeDefined();
    expect(method!.docstring).toContain('Returns the maximum');
    expect(method!.docstring).toContain('@param a');
  });

  it('stops at empty lines and does not over-collect', async () => {
    const code = `
// This is a doc

function isolated() {}
`;
    const result = await extractFromSource('isolated.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toBeUndefined();
  });

  it('stops at non-comment code before the definition', async () => {
    const code = `
const x = 1;
function afterCode() {}
`;
    const result = await extractFromSource('after.ts', code, 'typescript');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toBeUndefined();
  });

  it('prefers Python docstring over preceding line comments', async () => {
    const code = `
# module comment
def helper():
    """The real docstring."""
    pass
`;
    const result = await extractFromSource('helper.py', code, 'python');
    expect(result.errors).toHaveLength(0);

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn!.docstring).toContain('The real docstring');
  });
});
