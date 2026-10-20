import { useEffect, useState } from 'react';
import { auditLog, type AuditRow } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { ReportShell } from '../reports/ReportShell';
import { toCsv } from '../reports/csv';
import { useReport } from '../reports/useReport';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import { todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';

const ENTITIES = ['voucher', 'ledger', 'ledger_opening', 'book', 'company', 'financial_year', 'user'].map((e) => ({ id: e, label: e }));

const pad = (n: number) => String(n).padStart(2, '0');
function when(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A short human summary of what changed. */
export function summarize(row: AuditRow): string {
  const v = (row.newValues ?? row.oldValues) as Record<string, unknown> | null;
  if (row.entity === 'voucher' && v && typeof v.voucherNo === 'number') return `Voucher no. ${v.voucherNo} on ${v.date}`;
  const text = JSON.stringify(v ?? {});
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

const COLUMNS: Column<AuditRow>[] = [
  { key: 'at', header: 'When', value: (r) => when(r.at) },
  { key: 'user', header: 'User', value: (r) => r.username ?? '' },
  { key: 'entity', header: 'What', value: (r) => r.entity },
  { key: 'action', header: 'Action', value: (r) => r.action },
  { key: 'summary', header: 'Details', value: summarize },
];

const CSV_COLUMNS: Column<AuditRow>[] = [
  ...COLUMNS.slice(0, 4),
  { key: 'old', header: 'Before', value: (r) => (r.oldValues == null ? '' : JSON.stringify(r.oldValues)) },
  { key: 'new', header: 'After', value: (r) => (r.newValues == null ? '' : JSON.stringify(r.newValues)) },
];

export function AuditScreen() {
  const api = useApi();
  const { company } = useSession();
  const today = todayIso();
  const weekAgo = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const [from, setFrom] = useState<string | null>(weekAgo);
  const [to, setTo] = useState<string | null>(today);
  const [entity, setEntity] = useState<string | null>(null);
  const report = useReport<AuditRow[]>();

  const runNow = () => {
    if (!company) return;
    if (!from || !to) return report.fail('Enter both dates');
    return report.run(() => auditLog(api, { companyId: company.id, from, to, ...(entity ? { entity } : {}) }));
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  if (!company) return <p className="panel">Choose a company first (F9).</p>;
  const ctx: DateCtx = { yearStart: '2000-01-01', yearEnd: '2099-12-31', base: today };
  const rows = report.data;

  return (
    <ReportShell
      screenId="audit"
      shortcuts={['run', 'csv']}
      title="Audit Log"
      subtitle={from && to ? `${from} to ${to}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} autoFocus />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
          <Field label="What">
            <Lookup label="What" items={ENTITIES} value={entity} onChange={setEntity} />
          </Field>
        </>
      }
      csv={() => rows && { fileName: 'audit-log.csv', text: toCsv(CSV_COLUMNS, rows, { title: [company.name, 'Audit log'] }) }}
    >
      {rows && <DataTable caption="Audit log" columns={COLUMNS} rows={rows} rowKey={(r) => `${r.at}-${r.entityId ?? ''}-${r.action}-${r.entity}`} emptyText="Nothing was recorded for these filters" />}
    </ReportShell>
  );
}
