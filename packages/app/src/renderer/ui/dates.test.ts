import { describe, expect, it } from 'vitest';
import { clampToYear, formatDisplay, parseDateInput, todayIso, type DateCtx } from './dates';

const ctx: DateCtx = { yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' };

describe('parseDateInput', () => {
  it('a day alone uses the month and year of the base date', () => {
    expect(parseDateInput('10', ctx)).toBe('2026-05-10');
    expect(parseDateInput('7', ctx)).toBe('2026-05-07');
  });
  it('day and month take the year from the financial year', () => {
    expect(parseDateInput('1005', ctx)).toBe('2026-05-10');
    expect(parseDateInput('0102', ctx)).toBe('2027-02-01');
    expect(parseDateInput('1/2', ctx)).toBe('2027-02-01');
    expect(parseDateInput('10/5', ctx)).toBe('2026-05-10');
  });
  it('accepts two-digit and four-digit years, with or without separators', () => {
    expect(parseDateInput('100526', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10052026', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10-05-26', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10/05/2026', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10.05.2026', ctx)).toBe('2026-05-10');
  });
  it('handles leap days using the financial year', () => {
    const leap: DateCtx = { yearStart: '2027-04-01', yearEnd: '2028-03-31', base: '2027-04-01' };
    expect(parseDateInput('2902', leap)).toBe('2028-02-29');
    expect(parseDateInput('2902', ctx)).toBeNull();
  });
  it('rejects nonsense', () => {
    for (const bad of ['', '  ', 'abc', '10a', '31/02', '3104', '0013', '999999999', '1005-', '35']) {
      expect(parseDateInput(bad, ctx), bad).toBeNull();
    }
  });
  it('a day that does not exist in the base month is rejected', () => {
    expect(parseDateInput('31', { ...ctx, base: '2026-04-03' })).toBeNull();
  });
});

describe('formatDisplay / todayIso / clampToYear', () => {
  it('formats as dd-mm-yyyy', () => {
    expect(formatDisplay('2026-05-03')).toBe('03-05-2026');
  });
  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 4, 3, 23, 30))).toBe('2026-05-03');
  });
  it('clamps a date into the year', () => {
    expect(clampToYear('2026-01-01', '2026-04-01', '2027-03-31')).toBe('2026-04-01');
    expect(clampToYear('2028-01-01', '2026-04-01', '2027-03-31')).toBe('2027-03-31');
    expect(clampToYear('2026-08-01', '2026-04-01', '2027-03-31')).toBe('2026-08-01');
  });
});
