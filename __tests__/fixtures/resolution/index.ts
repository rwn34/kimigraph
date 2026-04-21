import { add, multiply } from './math';

export function sumThree(a: number, b: number, c: number): number {
  return add(add(a, b), c);
}

export function productThree(a: number, b: number, c: number): number {
  return multiply(multiply(a, b), c);
}
