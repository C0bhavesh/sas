import { fromPaise, toPaise } from '@sas/shared';

/** 1234567.5 -> "12,34,567.50": the last three digits, then groups of two. */
export function formatInr(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole = '0', frac = ''] = (negative ? amount.slice(1) : amount).split('.');
  const tail = whole.slice(-3);
  let rest = whole.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  const grouped = groups.length ? `${groups.join(',')},${tail}` : tail;
  return `${negative ? '-' : ''}${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

export function formatDrCr(x: { amount: string; side: 'Dr' | 'Cr' }): string {
  return `${formatInr(x.amount)} ${x.side}`;
}

/** Typed text to a two-decimal amount, or "" when there is nothing to normalise. Extra decimals are cut, never rounded. */
export function normalizeAmount(text: string): string {
  const t = text.replace(/,/g, '').trim();
  if (t === '' || t === '.') return '';
  const [whole = '', frac = ''] = t.split('.');
  return fromPaise(toPaise(`${whole === '' ? '0' : whole}.${frac.slice(0, 2).padEnd(2, '0')}`));
}
