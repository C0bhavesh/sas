import { describe, expect, it } from 'vitest';
import type { Column } from '../ui/DataTable';
import { slug, toCsv } from './csv';

interface Row {
  name: string;
  amount: string;
  raw: string;
}
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'amount', header: 'Amount', numeric: true, value: (r) => r.amount, csv: (r) => r.raw },
];

describe('toCsv', () => {
  it('writes a header, the rows and CRLF line ends', () => {
    expect(toCsv(COLUMNS, [{ name: 'A', amount: '1,000.00', raw: '1000.00' }])).toBe('Name,Amount\r\nA,1000.00\r\n');
  });

  it('uses the raw csv value when a column has one, and the display value otherwise', () => {
    const plain: Column<Row>[] = [{ key: 'amount', header: 'Amount', value: (r) => r.amount }];
    expect(toCsv(plain, [{ name: 'A', amount: '1,000.00', raw: '1000.00' }])).toBe('Amount\r\n"1,000.00"\r\n');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    const rows: Row[] = [{ name: 'Ramesh, Traders "Surat"\nline2', amount: '1', raw: '1.00' }];
    expect(toCsv(COLUMNS, rows)).toBe('Name,Amount\r\n"Ramesh, Traders ""Surat""\nline2",1.00\r\n');
  });

  it('keeps Gujarati text as it is', () => {
    expect(toCsv(COLUMNS, [{ name: 'રમેશ ટ્રેડર્સ', amount: '1', raw: '1.00' }])).toContain('રમેશ ટ્રેડર્સ,1.00');
  });

  it('puts title lines first, then a blank line, and appends a footer', () => {
    const text = toCsv(COLUMNS, [{ name: 'A', amount: '1', raw: '1.00' }], { title: ['Test Co', 'Ledger: Cash'], footer: ['Total', '1.00'] });
    expect(text).toBe('Test Co\r\nLedger: Cash\r\n\r\nName,Amount\r\nA,1.00\r\nTotal,1.00\r\n');
  });
});

describe('slug', () => {
  it('makes a file-name-safe word, keeping letters of any script', () => {
    expect(slug('Trial Balance')).toBe('trial-balance');
    expect(slug('  Cash / Bank Book!! ')).toBe('cash-bank-book');
    expect(slug('રમેશ ટ્રેડર્સ')).toContain('રમેશ');
    expect(slug('///')).toBe('report');
  });
});
