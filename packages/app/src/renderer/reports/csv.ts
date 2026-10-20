import type { Column } from '../ui/DataTable';

const NEEDS_QUOTES = /[",\r\n]/;
const cell = (text: string) => (NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export function toCsv<T>(columns: Column<T>[], rows: T[], extra: { title?: string[]; footer?: string[] } = {}): string {
  const lines: string[][] = [];
  for (const t of extra.title ?? []) lines.push([t]);
  if (extra.title?.length) lines.push([]);
  lines.push(columns.map((c) => c.header));
  for (const r of rows) lines.push(columns.map((c) => (c.csv ?? c.value)(r)));
  if (extra.footer) lines.push(extra.footer);
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/**
 * A file-name-safe word. Letters, digits and combining marks of any script are kept: the vowel signs of
 * Gujarati and Hindi are marks, not letters, so dropping them would chop a name into pieces.
 */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'report';
}
