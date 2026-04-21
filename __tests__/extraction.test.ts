import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSource } from '../src/extraction/index';
import { initGrammars } from '../src/extraction/grammar';

describe('Extraction', () => {
  beforeAll(async () => {
    await initGrammars();
  });

  it('extracts TypeScript functions and classes', async () => {
    const code = `
function hello(name: string): string {
  return 'Hello ' + name;
}

class Greeter {
  greet(name: string): void {
    console.log(hello(name));
  }
}
`;
    const result = await extractFromSource('test.ts', code, 'typescript');

    expect(result.errors).toHaveLength(0);
    expect(result.nodes.length).toBeGreaterThanOrEqual(3); // file + hello + Greeter + greet

    const func = result.nodes.find((n) => n.name === 'hello');
    expect(func).toBeDefined();
    expect(func!.kind).toBe('function');

    const cls = result.nodes.find((n) => n.name === 'Greeter');
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe('class');
  });

  it('extracts Python functions', async () => {
    const code = `
def hello(name: str) -> str:
    return f"Hello {name}"

class Greeter:
    def greet(self, name: str):
        print(hello(name))
`;
    const result = await extractFromSource('test.py', code, 'python');

    expect(result.errors).toHaveLength(0);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);

    const func = result.nodes.find((n) => n.name === 'hello');
    expect(func).toBeDefined();
    expect(func!.kind).toBe('function');
  });

  it('extracts unresolved call refs', async () => {
    const code = `
function helper() { return 1; }
function main() { return helper(); }
`;
    const result = await extractFromSource('calls.ts', code, 'typescript');

    // Calls are now captured as unresolvedRefs, resolved later by ReferenceResolver
    const callRefs = result.unresolvedRefs.filter((r) => r.refKind === 'function');
    expect(callRefs.length).toBeGreaterThanOrEqual(1);
    expect(callRefs.some((r) => r.refName === 'helper')).toBe(true);
  });

  it('extracts Go functions, structs, and interfaces', async () => {
    const code = `
package main

import "fmt"

type User struct {
	Name string
}

type Stringer interface {
	String() string
}

func (u User) String() string {
	return u.Name
}

func main() {
	u := User{Name: "test"}
	fmt.Println(u.String())
}
`;
    const result = await extractFromSource('test.go', code, 'go');

    expect(result.errors).toHaveLength(0);
    expect(result.nodes.length).toBeGreaterThanOrEqual(4); // file + User + Stringer + String + main

    const userStruct = result.nodes.find((n) => n.name === 'User');
    expect(userStruct).toBeDefined();
    expect(userStruct!.kind).toBe('class'); // structs mapped to class

    const stringerInterface = result.nodes.find((n) => n.name === 'Stringer');
    expect(stringerInterface).toBeDefined();
    expect(stringerInterface!.kind).toBe('interface');

    const mainFunc = result.nodes.find((n) => n.name === 'main');
    expect(mainFunc).toBeDefined();
    expect(mainFunc!.kind).toBe('function');

    const method = result.nodes.find((n) => n.name === 'String');
    expect(method).toBeDefined();
    expect(method!.kind).toBe('method');
  });

  it('extracts Rust functions, structs, traits, and impls', async () => {
    const code = `
use std::fmt;

pub struct User {
    pub name: String,
}

pub trait Stringer {
    fn string(&self) -> String;
}

impl Stringer for User {
    fn string(&self) -> String {
        self.name.clone()
    }
}

fn main() {
    let u = User { name: String::from("test") };
    println!("{}", u.string());
}
`;
    const result = await extractFromSource('test.rs', code, 'rust');

    expect(result.errors).toHaveLength(0);
    expect(result.nodes.length).toBeGreaterThanOrEqual(4); // file + User + Stringer + string + main

    const userStruct = result.nodes.find((n) => n.name === 'User');
    expect(userStruct).toBeDefined();
    expect(userStruct!.kind).toBe('class');

    const stringerTrait = result.nodes.find((n) => n.name === 'Stringer');
    expect(stringerTrait).toBeDefined();
    expect(stringerTrait!.kind).toBe('interface');

    const mainFunc = result.nodes.find((n) => n.name === 'main');
    expect(mainFunc).toBeDefined();
    expect(mainFunc!.kind).toBe('function');
  });

  it('extracts Java classes, methods, and interfaces', async () => {
    const code = `
import java.util.List;

public interface Stringer {
    String string();
}

public class User implements Stringer {
    private String name;

    public User(String name) {
        this.name = name;
    }

    @Override
    public String string() {
        return this.name;
    }
}
`;
    const result = await extractFromSource('User.java', code, 'java');

    expect(result.errors).toHaveLength(0);
    expect(result.nodes.length).toBeGreaterThanOrEqual(3); // file + User + Stringer + string + User ctor

    const userClass = result.nodes.find((n) => n.name === 'User');
    expect(userClass).toBeDefined();
    expect(userClass!.kind).toBe('class');

    const stringerInterface = result.nodes.find((n) => n.name === 'Stringer');
    expect(stringerInterface).toBeDefined();
    expect(stringerInterface!.kind).toBe('interface');

    const stringMethod = result.nodes.find((n) => n.name === 'string');
    expect(stringMethod).toBeDefined();
    expect(stringMethod!.kind).toBe('method');
  });
});
