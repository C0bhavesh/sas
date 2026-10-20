import { describe, expect, it } from 'vitest';
import { fromPaise, roundToRupee, sumPaise, toPaise } from './money';

describe('toPaise', () => {
  it('parses whole and decimal amounts exactly', () => {
    expect(toPaise('123.45')).toBe(12345n);
    expect(toPaise('5')).toBe(500n);
    expect(toPaise('5.5')).toBe(550n);
    expect(toPaise('0.07')).toBe(7n);
  });
  it('parses negatives', () => {
    expect(toPaise('-0.05')).toBe(-5n);
    expect(toPaise('-10')).toBe(-1000n);
  });
  it('rejects bad input', () => {
    expect(() => toPaise('1.234')).toThrow();
    expect(() => toPaise('')).toThrow();
    expect(() => toPaise('abc')).toThrow();
    expect(() => toPaise('1,000')).toThrow();
  });
});

describe('fromPaise', () => {
  it('always prints two decimals', () => {
    expect(fromPaise(12345n)).toBe('123.45');
    expect(fromPaise(500n)).toBe('5.00');
    expect(fromPaise(7n)).toBe('0.07');
    expect(fromPaise(-5n)).toBe('-0.05');
    expect(fromPaise(0n)).toBe('0.00');
  });
});

describe('sumPaise', () => {
  it('adds exactly where floats would not', () => {
    // 0.1 + 0.2 !== 0.3 in floating point
    expect(sumPaise([toPaise('0.10'), toPaise('0.20')])).toBe(toPaise('0.30'));
    expect(sumPaise([])).toBe(0n);
  });
});

describe('roundToRupee', () => {
  it('rounds half away from zero to whole rupees', () => {
    expect(roundToRupee(150n)).toBe(200n);
    expect(roundToRupee(149n)).toBe(100n);
    expect(roundToRupee(-150n)).toBe(-200n);
    expect(roundToRupee(-149n)).toBe(-100n);
    expect(roundToRupee(0n)).toBe(0n);
  });
});
