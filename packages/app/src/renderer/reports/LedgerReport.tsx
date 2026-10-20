import { useEffect, useState } from 'react';
import { ledgerReport, type LedgerReportDto } from '../api/endpoints';
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

type Row = LedgerReportDto['rows'][number];

const COLUMNS: Column<Row>[] = [
  { key: 'date', header: 'Date', value: (r) => formatDisplay(r.date) },
  { key: 'no', header: 'Vch', value: (r) => String(r.voucherNo) },
  { key: 'book', header: 'Book', value: (r) => r.bookCode },
  { key: 'narration', header: 'Narration', value: (r) => r.narration ?? '' },
  { key: 'debit', header: 'Debit', numeric: true, value: (r) => formatInr(r.debit), csv: (r) => r.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (r) => formatInr(r.credit), csv: (r) => r.credit },
  { key: 'balance', header: 'Balance', numeric: true, value: (r) => formatDrCr(r.balance), csv: (r) => `${r.balance.amount} ${r.balance.side}` },
];

export function LedgerReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<LedgerReportDto>();

  const requestRun = useCommittedAction(() => {
    if (!company || !year) return;
    if (!ledgerId) return report.fail('Choose the account');
    if (!from || !to) return report.fail('Enter both dates');
    if (to < from) return report.fail('The end date is before the start date');
    return report.run(() => ledgerReport(api, { companyId: company.id, yearId: year.id, ledgerId, from, to }));
  });

  // a new company or year makes any shown report out of date
  useEffect(() => report.fail(''), [company?.id, year?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const data = report.data;

  return (
    <ReportShell
      screenId="rLedger"
      title="Ledger"
      subtitle={data ? `${data.ledgerName}, ${from ? formatDisplay(from) : ''} to ${to ? formatDisplay(to) : ''}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="Account">
            <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} autoFocus />
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
        data && {
          fileName: `ledger-${slug(data.ledgerName)}.csv`,
          text: toCsv(COLUMNS, data.rows, {
            title: [company.name, year.label, `Ledger: ${data.ledgerName}`, `Opening balance: ${data.opening.amount} ${data.opening.side}`],
            footer: ['', '', '', 'Total', data.totalDebit, data.totalCredit, `${data.closing.amount} ${data.closing.side}`],
          }),
        }
      }
    >
      {data && (
        <>
          <p>
            Opening balance <strong>{formatDrCr(data.opening)}</strong>
          </p>
          <DataTable
            caption="Ledger"
            columns={COLUMNS}
            rows={data.rows}
            rowKey={(r) => `${r.date}-${r.voucherNo}-${r.bookCode}-${r.debit}-${r.credit}`}
            emptyText="No entries in this period"
            footer={{ narration: 'Total', debit: formatInr(data.totalDebit), credit: formatInr(data.totalCredit), balance: formatDrCr(data.closing) }}
          />
        </>
      )}
    </ReportShell>
  );
}
