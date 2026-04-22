import { describe, it, expect } from 'vitest';
import { KimiGraph } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cross-file inheritance resolution', () => {
  it('resolves extends edge when parent is in another file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-inherit-'));

    fs.writeFileSync(
      path.join(tmpDir, 'Animal.ts'),
      `export class Animal { move() {} }`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'Dog.ts'),
      `import { Animal } from './Animal';
export class Dog extends Animal { bark() {} }`
    );

    const kg = await KimiGraph.init(tmpDir, { embedSymbols: false });
    await kg.indexAll();

    const dogResults = await kg.searchNodes('Dog');
    const animalResults = await kg.searchNodes('Animal');
    const dogNode = dogResults.find((r) => r.node.kind === 'class')?.node;
    const animalNode = animalResults.find((r) => r.node.kind === 'class')?.node;

    expect(dogNode).toBeDefined();
    expect(animalNode).toBeDefined();

    const pathResult = kg.findPath(dogNode!.id, animalNode!.id);
    expect(pathResult.nodes.length).toBeGreaterThanOrEqual(2);
    expect(pathResult.nodes.some((n) => n.name === 'Dog')).toBe(true);
    expect(pathResult.nodes.some((n) => n.name === 'Animal')).toBe(true);

    kg.close();
  });

  it('resolves implements edge when interface is in another file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-impl-'));

    fs.writeFileSync(
      path.join(tmpDir, 'Runnable.ts'),
      `export interface Runnable { run(): void; }`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'Task.ts'),
      `import { Runnable } from './Runnable';
export class Task implements Runnable { run() {} }`
    );

    const kg = await KimiGraph.init(tmpDir, { embedSymbols: false });
    await kg.indexAll();

    const taskResults = await kg.searchNodes('Task');
    const runnableResults = await kg.searchNodes('Runnable');
    const taskNode = taskResults.find((r) => r.node.kind === 'class')?.node;
    const runnableNode = runnableResults.find((r) => r.node.kind === 'interface')?.node;

    expect(taskNode).toBeDefined();
    expect(runnableNode).toBeDefined();

    const pathResult = kg.findPath(taskNode!.id, runnableNode!.id);
    expect(pathResult.nodes.length).toBeGreaterThanOrEqual(2);
    expect(pathResult.nodes.some((n) => n.name === 'Task')).toBe(true);
    expect(pathResult.nodes.some((n) => n.name === 'Runnable')).toBe(true);

    kg.close();
  });
});
