import { useEffect, useState } from 'react';
import { cashBookReport, type CashBookDayDto } from '../api/endpoints';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatDrCr, formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { slug, toCsv } from './csv';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

const COLUMNS: Column<CashBookDayDto>[] = [
  { key: 'date', header: 'Date', value: (d) => formatDisplay(d.date) },
  { key: 'opening', header: 'Opening', numeric: true, value: (d) => formatDrCr(d.opening), csv: (d) => `${d.opening.amount} ${d.opening.side}` },
  { key: 'receipts', header: 'Receipts', numeric: true, value: (d) => formatInr(d.receipts), csv: (d) => d.receipts },
  { key: 'payments', header: 'Payments', numeric: true, value: (d) => formatInr(d.payments), csv: (d) => d.payments },
  { key: 'closing', header: 'Closing', numeric: true, value: (d) => formatDrCr(d.closing), csv: (d) => `${d.closing.amount} ${d.closing.side}` },
];

export function CashBookReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [bookId, setBookId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<CashBookDayDto[]>();

  const requestRun = useCommittedAction(() => {
    if (!company || !year) return;
    if (!bookId) return report.fail('Choose the book');
    if (!from || !to) return report.fail('Enter both dates');
    if (to < from) return report.fail('The end date is before the start date');
    return report.run(() => cashBookReport(api, { companyId: company.id, yearId: year.id, bookId, from, to }));
  });

  useEffect(() => report.fail(''), [company?.id, year?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const bookName = lookups.books.find((b) => b.id === bookId)?.name ?? '';
  const days = report.data;

  return (
    <ReportShell
      screenId="rCashBook"
      title="Cash / Bank Book"
      subtitle={days ? `${bookName}, ${from ? formatDisplay(from) : ''} to ${to ? formatDisplay(to) : ''}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="Book">
            <Lookup label="Book" items={lookups.bookItems('receipt')} value={bookId} onChange={setBookId} autoFocus />
          </Field>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
        </>
      }
      csv={() =>
        days && {
          fileName: `cash-book-${slug(bookName)}.csv`,
          text: toCsv(COLUMNS, days, { title: [company.name, year.label, `Book: ${bookName}`] }),
        }
      }
    >
      {days && <DataTable caption="Cash book" columns={COLUMNS} rows={days} rowKey={(d) => d.date} emptyText="No entries in this period" />}
    </ReportShell>
  );
}
