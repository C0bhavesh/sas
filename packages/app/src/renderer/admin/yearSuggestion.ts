import type { YearLite } from '../api/types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The year after `year`: it starts the day after this one ends and lasts a year. */
export function nextYearSuggestion(year: YearLite): { label: string; start: string; end: string } {
  const start = new Date(`${year.endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  // A 1 March start with a leap day wrapping to 28 Feb: setUTCFullYear on 29 Feb would roll over, so re-derive.
  const startYear = start.getUTCFullYear();
  const label = start.getUTCMonth() === 0 ? String(startYear) : `${startYear}-${pad((startYear + 1) % 100)}`;
  return { label, start: iso(start), end: iso(end) };
}
