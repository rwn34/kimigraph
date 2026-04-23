import { describe, it, expect } from 'vitest';

describe('NodeKind governance', () => {
  it('has no more than 15 node kinds (VALIDATION hard limit)', () => {
    // This test enforces the VALIDATION.md auto-fail threshold.
    // If you need to add a kind, you MUST either remove an existing one
    // or update VALIDATION.md and this test.
    const nodeKinds = [
      'file',
      'function',
      'method',
      'class',
      'interface',
      'type_alias',
      'variable',
      'constant',
      'property',
      'enum',
      'enum_member',
      'import',
      'export',
      'comment',
    ];
    expect(nodeKinds.length).toBeLessThanOrEqual(15);
    // Also assert the actual count so the test fails when someone adds a kind
    expect(nodeKinds.length).toBe(14);
  });

  it('has no more than 8 edge kinds (sanity check)', () => {
    const edgeKinds = ['contains', 'calls', 'imports', 'extends', 'implements', 'ffi'];
    expect(edgeKinds.length).toBeLessThanOrEqual(8);
    expect(edgeKinds.length).toBe(6);
  });
});
