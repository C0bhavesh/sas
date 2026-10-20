export interface DateCtx {
  /** Start and end of the financial year, ISO. */
  yearStart: string;
  yearEnd: string;
  /** Used when only a day is typed: its month and year apply. */
  base: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function isReal(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const toIso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function clampToYear(iso: string, start: string, end: string): string {
  return iso < start ? start : iso > end ? end : iso;
}

/**
 * Operators type dates in a hurry: "10", "1005", "100526", "10052026", "10/5", "10-05-26".
 * A day and month without a year take the year of the financial year that contains that date.
 */
export function parseDateInput(text: string, ctx: DateCtx): string | null {
  const t = text.trim();
  // Only digits and the separators / . - are allowed, and a separator at either end is a typo, not a date.
  if (t === '' || /[^0-9\s/.\-]/.test(t) || /^[/.\-]|[/.\-]$/.test(t)) return null;

  let d: number;
  let m: number | undefined;
  let y: number | undefined;
  const parts = t.split(/[^0-9]+/).filter(Boolean);
  if (parts.length >= 2) {
    d = Number(parts[0]);
    m = Number(parts[1]);
    if (parts[2] !== undefined) y = parts[2].length <= 2 ? 2000 + Number(parts[2]) : Number(parts[2]);
  } else {
    const digits = parts[0] ?? '';
    if (digits.length <= 2) d = Number(digits);
    else if (digits.length === 4) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2));
    } else if (digits.length === 6) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2, 4));
      y = 2000 + Number(digits.slice(4));
    } else if (digits.length === 8) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2, 4));
      y = Number(digits.slice(4));
    } else return null;
  }

  if (m === undefined) {
    const [by, bm] = ctx.base.split('-').map(Number) as [number, number];
    m = bm;
    y = by;
  } else if (y === undefined) {
    const startYear = Number(ctx.yearStart.slice(0, 4));
    const endYear = Number(ctx.yearEnd.slice(0, 4));
    y = [startYear, endYear].find((cy) => {
      if (!isReal(cy, m!, d)) return false;
      const iso = toIso(cy, m!, d);
      return iso >= ctx.yearStart && iso <= ctx.yearEnd;
    });
    if (y === undefined) return null;
  }
  return isReal(y!, m, d) ? toIso(y!, m, d) : null;
}
