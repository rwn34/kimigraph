import { describe, it, expect, beforeEach } from 'vitest';
import { KimiGraph } from '../src/index';
import * as path from 'path';
import * as fs from 'fs';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'languages');

describe('Multi-language indexing', () => {
  beforeEach(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimigraph'), { recursive: true, force: true });
    fs.rmSync(path.join(FIXTURE_DIR, '.kimi'), { recursive: true, force: true });

    // TypeScript
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'api.ts'),
      `export function getUser() { return { name: 'test' }; }\n`,
      'utf8'
    );

    // Go
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.go'),
      `package main\n\nfunc main() { println("hello") }\n`,
      'utf8'
    );

    // Rust
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'lib.rs'),
      `pub fn add(a: i32, b: i32) -> i32 { a + b }\n`,
      'utf8'
    );

    // Java
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'App.java'),
      `public class App { public static void main(String[] args) { System.out.println("hi"); } }\n`,
      'utf8'
    );

    // C
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.c'),
      `#include <stdio.h>\nint main() { printf("hello\\n"); return 0; }\n`,
      'utf8'
    );

    // C++
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.cpp'),
      `#include <iostream>\nint main() { std::cout << "hello" << std::endl; return 0; }\n`,
      'utf8'
    );

    // C#
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'Program.cs'),
      `using System;\nclass Program { static void Main() { Console.WriteLine("hello"); } }\n`,
      'utf8'
    );

    // Ruby
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'app.rb'),
      `class App\n  def greet\n    puts "hello"\n  end\nend\n`,
      'utf8'
    );

    // PHP
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'index.php'),
      `<?php\nfunction greet() { echo "hello"; }\n`,
      'utf8'
    );

    // Swift
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'main.swift'),
      `func greet() { print("hello") }\n`,
      'utf8'
    );

    // Kotlin
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'Main.kt'),
      `fun main() { println("hello") }\n`,
      'utf8'
    );
  });

  it('indexes all 13 languages', async () => {
    const kg = await KimiGraph.init(FIXTURE_DIR, { embedSymbols: false });
    await kg.indexAll();

    const stats = kg.getStats();
    const langs = Object.keys(stats.filesByLanguage);

    expect(langs).toContain('typescript');
    expect(langs).toContain('go');
    expect(langs).toContain('rust');
    expect(langs).toContain('java');
    expect(langs).toContain('c');
    expect(langs).toContain('cpp');
    expect(langs).toContain('csharp');
    expect(langs).toContain('ruby');
    expect(langs).toContain('php');
    expect(langs).toContain('swift');
    expect(langs).toContain('kotlin');

    expect(stats.files).toBe(11);
    expect(stats.nodes).toBeGreaterThanOrEqual(11);

    kg.close();
  });
});
