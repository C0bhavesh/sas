import { describe, expect, it } from 'vitest';
import { formatDrCr, formatInr, normalizeAmount } from './format';

describe('formatInr', () => {
  it('groups digits the Indian way', () => {
    expect(formatInr('0')).toBe('0.00');
    expect(formatInr('999')).toBe('999.00');
    expect(formatInr('1000')).toBe('1,000.00');
    expect(formatInr('100000')).toBe('1,00,000.00');
    expect(formatInr('1234567.5')).toBe('12,34,567.50');
    expect(formatInr('123456789.05')).toBe('12,34,56,789.05');
  });
  it('keeps the sign of negative amounts', () => {
    expect(formatInr('-100000')).toBe('-1,00,000.00');
    expect(formatInr('-0.5')).toBe('-0.50');
  });
});

describe('formatDrCr', () => {
  it('prints the amount with its side', () => {
    expect(formatDrCr({ amount: '1500', side: 'Dr' })).toBe('1,500.00 Dr');
    expect(formatDrCr({ amount: '20.5', side: 'Cr' })).toBe('20.50 Cr');
  });
});

describe('normalizeAmount', () => {
  it('turns typed text into a two-decimal amount, or empty', () => {
    expect(normalizeAmount('')).toBe('');
    expect(normalizeAmount('.')).toBe('');
    expect(normalizeAmount('5')).toBe('5.00');
    expect(normalizeAmount('.5')).toBe('0.50');
    expect(normalizeAmount('5.')).toBe('5.00');
    expect(normalizeAmount('1,234.5')).toBe('1234.50');
    expect(normalizeAmount('007.1')).toBe('7.10');
    expect(normalizeAmount('12.345')).toBe('12.34');
  });
});
