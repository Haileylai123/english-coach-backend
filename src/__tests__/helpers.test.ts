// src/__tests__/helpers.test.ts
import { describe, it, expect } from 'vitest';
import { clamp, safeJson } from '../lib/helpers';

describe('helpers — clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles edge cases', () => {
    expect(clamp(0, 0, 0)).toBe(0);
    expect(clamp(5, 5, 5)).toBe(5);
  });
});

describe('helpers — safeJson', () => {
  it('parses valid JSON', () => {
    expect(safeJson('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJson('not json', [])).toEqual([]);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeJson(null, 'fallback')).toBe('fallback');
    expect(safeJson(undefined, 42)).toBe(42);
    expect(safeJson('', 'empty')).toBe('empty');
  });

  it('handles arrays', () => {
    expect(safeJson('[1,2,3]', [])).toEqual([1, 2, 3]);
  });
});
