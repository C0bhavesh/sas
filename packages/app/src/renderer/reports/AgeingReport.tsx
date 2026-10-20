import { useEffect, useState } from 'react';
import { ageingReport, type AgeingDto } from '../api/endpoints';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { toCsv } from './csv';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

type Row = AgeingDto['rows'][number];
const SHOW = [
  { id: 'all', label: 'All' },
  { id: 'Dr', label: 'Debtors (they owe us)' },
  { id: 'Cr', label: 'Creditors (we owe them)' },
];

function columnsFor(labels: string[]): Column<Row>[] {
  return [
    { key: 'name', header: 'Account', value: (r) => r.ledgerName },
    { key: 'side', header: 'Side', value: (r) => r.side },
    ...labels.map((label, i) => ({
      key: `b${i}`,
      header: label,
      numeric: true,
      value: (r: Row) => formatInr(r.buckets[i] ?? '0.00'),
      csv: (r: Row) => r.buckets[i] ?? '0.00',
    })),
    { key: 'total', header: 'Total', numeric: true, value: (r) => formatInr(r.total), csv: (r) => r.total },
    { key: 'onAccount', header: 'On account', numeric: true, value: (r) => formatInr(r.onAccount), csv: (r) => r.onAccount },
    { key: 'net', header: 'Net', numeric: true, value: (r) => formatInr(r.net), csv: (r) => r.net },
  ];
}

export function AgeingReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [asOn, setAsOn] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const [show, setShow] = useState<string | null>('all');
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const report = useReport<AgeingDto>();

  const runNow = () => {
    if (!company) return;
    if (!asOn) return report.fail('Enter the date');
    return report.run(() =>
      ageingReport(api, { companyId: company.id, asOn, ...(show === 'Dr' || show === 'Cr' ? { side: show } : {}), ...(ledgerId ? { ledgerId } : {}) }),
    );
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const data = report.data;
  const columns = columnsFor(data?.bucketLabels ?? ['0-30', '31-60', '61-90', '90+']);

  return (
    <ReportShell
      screenId="rAgeing"
      title="Outstanding Ageing"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="As on">
            <DateInput label="As on" value={asOn} ctx={ctx} onChange={setAsOn} autoFocus />
          </Field>
          <Field label="Show">
            <Lookup label="Show" items={SHOW} value={show} onChange={setShow} />
          </Field>
          <Field label="Account (optional)">
            <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} />
          </Field>
        </>
      }
      csv={() =>
        data && {
          fileName: 'outstanding-ageing.csv',
          text: toCsv(columns, data.rows, {
            title: [company.name, year.label, `Outstanding ageing as on ${asOn}`],
            footer: ['Total', '', ...data.totals.buckets, data.totals.total, data.totals.onAccount, data.totals.net],
          }),
        }
      }
    >
      {data && (
        <DataTable
          caption="Outstanding ageing"
          columns={columns}
          rows={data.rows}
          rowKey={(r) => `${r.ledgerId}-${r.side}`}
          emptyText="No pending bills"
          footer={{
            name: 'Total',
            ...Object.fromEntries(data.totals.buckets.map((b, i) => [`b${i}`, formatInr(b)])),
            total: formatInr(data.totals.total),
            onAccount: formatInr(data.totals.onAccount),
            net: formatInr(data.totals.net),
          }}
        />
      )}
    </ReportShell>
  );
}
