import { add } from './math.wasm';

const addon = require('./native.node');

export function compute(x: number, y: number): number {
  const wasmResult = add(x, y);
  const nativeResult = addon.add(x, y);
  return wasmResult + nativeResult;
}
