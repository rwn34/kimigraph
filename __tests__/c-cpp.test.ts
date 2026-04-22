import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../src/extraction';

describe('C extraction', () => {
  it('extracts struct fields as properties', async () => {
    const code = `
struct Point {
    int x;
    int y;
};
`;
    const result = await extractFromSource('point.c', code, 'c');
    expect(result.errors).toHaveLength(0);

    const props = result.nodes.filter((n) => n.kind === 'property');
    expect(props.length).toBeGreaterThanOrEqual(2);
    expect(props.some((p) => p.name === 'x')).toBe(true);
    expect(props.some((p) => p.name === 'y')).toBe(true);
  });

  it('extracts enums and enum members', async () => {
    const code = `
enum Color {
    RED,
    GREEN,
    BLUE
};
`;
    const result = await extractFromSource('color.c', code, 'c');
    expect(result.errors).toHaveLength(0);

    const enumNode = result.nodes.find((n) => n.kind === 'enum');
    expect(enumNode).toBeDefined();
    expect(enumNode!.name).toBe('Color');

    const members = result.nodes.filter((n) => n.kind === 'enum_member');
    expect(members.length).toBeGreaterThanOrEqual(3);
    expect(members.some((m) => m.name === 'RED')).toBe(true);
    expect(members.some((m) => m.name === 'GREEN')).toBe(true);
    expect(members.some((m) => m.name === 'BLUE')).toBe(true);
  });
});

describe('C++ extraction', () => {
  it('extracts class inheritance edges', async () => {
    const code = `
class Animal {
public:
    void speak();
};

class Dog : public Animal {
public:
    void speak() override;
};
`;
    const result = await extractFromSource('animals.cpp', code, 'cpp');
    expect(result.errors).toHaveLength(0);

    const classes = result.nodes.filter((n) => n.kind === 'class');
    expect(classes.length).toBeGreaterThanOrEqual(2);

    const extendsEdges = result.edges.filter((e) => e.kind === 'extends');
    expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts class fields as properties', async () => {
    const code = `
class Rectangle {
public:
    int width;
    int height;
};
`;
    const result = await extractFromSource('rect.cpp', code, 'cpp');
    expect(result.errors).toHaveLength(0);

    const props = result.nodes.filter((n) => n.kind === 'property');
    expect(props.length).toBeGreaterThanOrEqual(2);
    expect(props.some((p) => p.name === 'width')).toBe(true);
    expect(props.some((p) => p.name === 'height')).toBe(true);
  });
});
