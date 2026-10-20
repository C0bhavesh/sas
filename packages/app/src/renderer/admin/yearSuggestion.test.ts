import { describe, expect, it } from 'vitest';
import { nextYearSuggestion } from './yearSuggestion';

const year = (startDate: string, endDate: string) => ({ id: 'y', label: 'x', startDate, endDate, status: 'open' });

describe('nextYearSuggestion', () => {
  it('the April-to-March year after this one', () => {
    expect(nextYearSuggestion(year('2026-04-01', '2027-03-31'))).toEqual({ label: '2027-28', start: '2027-04-01', end: '2028-03-31' });
  });
  it('a calendar year is followed by the next calendar year, named by that year', () => {
    expect(nextYearSuggestion(year('2026-01-01', '2026-12-31'))).toEqual({ label: '2027', start: '2027-01-01', end: '2027-12-31' });
  });
  it('copes with a leap year', () => {
    expect(nextYearSuggestion(year('2027-04-01', '2028-03-31'))).toEqual({ label: '2028-29', start: '2028-04-01', end: '2029-03-31' });
    expect(nextYearSuggestion(year('2027-03-01', '2028-02-29'))).toEqual({ label: '2028-29', start: '2028-03-01', end: '2029-02-28' });
  });
  it('century labels wrap correctly', () => {
    expect(nextYearSuggestion(year('2099-04-01', '2100-03-31')).label).toBe('2100-01');
  });
});
