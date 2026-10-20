import { useEffect, useState } from 'react';
import {
  balanceSheetReport,
  profitLossReport,
  trialBalanceReport,
  type BalanceSheetDto,
  type ProfitLossDto,
  type TrialBalanceDto,
} from '../api/endpoints';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import type { ScreenId } from '../shell/screens';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { toCsv } from './csv';
import { balanceSheetSides, profitLossSides, sideBySide, type Line, type SideRow } from './layout';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

/** Shared by the three "as on a date" reports: the date filter, running on open, and the year/company guard. */
function useAsOnReport<T>(fetcher: (p: { companyId: string; yearId: string; asOn: string }) => Promise<T>) {
  const { company, year } = useSession();
  const [asOn, setAsOn] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<T>();

  const runNow = () => {
    if (!company || !year) return;
    if (!asOn) return report.fail('Enter the date');
    return report.run(() => fetcher({ companyId: company.id, yearId: year.id, asOn }));
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  const ctx: DateCtx | null = year ? { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) } : null;
  return { company, year, asOn, setAsOn, report, requestRun, ctx };
}

function AsOnFilter({ asOn, setAsOn, ctx }: { asOn: string | null; setAsOn: (v: string | null) => void; ctx: DateCtx }) {
  return (
    <Field label="As on">
      <DateInput label="As on" value={asOn} ctx={ctx} onChange={setAsOn} autoFocus />
    </Field>
  );
}

const needsCompany = <p className="panel">Choose a company and year first (F9).</p>;

// ---------------------------------------------------------------- trial balance

type TbRow = TrialBalanceDto['rows'][number];
type TbGroup = TrialBalanceDto['groups'][number];

const LEDGER_COLUMNS: Column<TbRow>[] = [
  { key: 'name', header: 'Account', value: (r) => r.ledgerName },
  { key: 'group', header: 'Group', value: (r) => r.groupName },
  { key: 'debit', header: 'Debit', numeric: true, value: (r) => formatInr(r.debit), csv: (r) => r.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (r) => formatInr(r.credit), csv: (r) => r.credit },
];
const GROUP_COLUMNS: Column<TbGroup>[] = [
  { key: 'name', header: 'Group', value: (g) => g.name },
  { key: 'nature', header: 'Nature', value: (g) => g.nature },
  { key: 'debit', header: 'Debit', numeric: true, value: (g) => formatInr(g.debit), csv: (g) => g.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (g) => formatInr(g.credit), csv: (g) => g.credit },
];
const VIEWS = [
  { id: 'ledger', label: 'Ledger-wise' },
  { id: 'group', label: 'Group-wise' },
];

export function TrialBalanceReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => trialBalanceReport(api, p));
  const [view, setView] = useState<string | null>('ledger');
  if (!company || !year || !ctx) return needsCompany;
  const tb = report.data;
  const byGroup = view === 'group';

  return (
    <ReportShell
      screenId="rTrial"
      title="Trial Balance"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />
          <Field label="View">
            <Lookup label="View" items={VIEWS} value={view} onChange={setView} />
          </Field>
        </>
      }
      csv={() =>
        tb && {
          fileName: 'trial-balance.csv',
          text: byGroup
            ? toCsv(GROUP_COLUMNS, tb.groups, { title: [company.name, year.label, `Trial balance by group as on ${asOn}`], footer: ['Total', '', tb.totalDebit, tb.totalCredit] })
            : toCsv(LEDGER_COLUMNS, tb.rows, { title: [company.name, year.label, `Trial balance as on ${asOn}`], footer: ['Total', '', tb.totalDebit, tb.totalCredit] }),
        }
      }
    >
      {tb && tb.difference !== '0.00' && (
        <p role="alert" className="err">
          The trial balance does not tally: debits and credits differ by {formatInr(tb.difference.replace('-', ''))}
          {tb.difference.startsWith('-') ? ' (credits are more)' : ' (debits are more)'}.
        </p>
      )}
      {tb && byGroup && (
        <DataTable caption="Trial balance by group" columns={GROUP_COLUMNS} rows={tb.groups} rowKey={(g) => String(g.code)} footer={{ name: 'Total', debit: formatInr(tb.totalDebit), credit: formatInr(tb.totalCredit) }} />
      )}
      {tb && !byGroup && (
        <DataTable caption="Trial balance" columns={LEDGER_COLUMNS} rows={tb.rows} rowKey={(r) => r.ledgerId} emptyText="No balances" footer={{ name: 'Total', debit: formatInr(tb.totalDebit), credit: formatInr(tb.totalCredit) }} />
      )}
    </ReportShell>
  );
}

// ------------------------------------------------- profit and loss / balance sheet

type SideRowIx = SideRow & { i: number };
const indexed = (rows: SideRow[]): SideRowIx[] => rows.map((r, i) => ({ ...r, i }));

function sideColumns(leftHeader: string, rightHeader: string): Column<SideRowIx>[] {
  const text = (l: Line | null) => (l ? `${l.level === 1 ? '   ' : ''}${l.label}` : '');
  const money = (l: Line | null) => (l ? formatInr(l.amount) : '');
  const node = (l: Line | null) => (l ? <span style={{ paddingLeft: l.level * 16, fontWeight: l.level === 0 ? 600 : 400 }}>{l.label}</span> : null);
  return [
    { key: 'left', header: leftHeader, value: (r) => text(r.left), render: (r) => node(r.left) },
    { key: 'leftAmount', header: 'Amount', numeric: true, value: (r) => money(r.left), csv: (r) => r.left?.amount ?? '' },
    { key: 'right', header: rightHeader, value: (r) => text(r.right), render: (r) => node(r.right) },
    { key: 'rightAmount', header: 'Amount', numeric: true, value: (r) => money(r.right), csv: (r) => r.right?.amount ?? '' },
  ];
}

export function ProfitLossReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => profitLossReport(api, p));
  if (!company || !year || !ctx) return needsCompany;
  const pl = report.data;
  const sides = pl && profitLossSides(pl);
  const rows = sides ? indexed(sideBySide(sides.left, sides.right)) : [];
  const columns = sideColumns('Expenses', 'Income');

  return (
    <ReportShell
      screenId="rPL"
      title="Profit & Loss"
      subtitle={asOn ? `for the year up to ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={<AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />}
      csv={() =>
        sides && {
          fileName: 'profit-and-loss.csv',
          text: toCsv(columns, rows, { title: [company.name, year.label, `Profit & Loss up to ${asOn}`], footer: ['Total', sides.leftTotal, 'Total', sides.rightTotal] }),
        }
      }
    >
      {sides && (
        <DataTable
          caption="Profit and loss"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.i)}
          emptyText="No income or expenses"
          footer={{ left: 'Total', leftAmount: formatInr(sides.leftTotal), right: 'Total', rightAmount: formatInr(sides.rightTotal) }}
        />
      )}
    </ReportShell>
  );
}

export function BalanceSheetReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => balanceSheetReport(api, p));
  if (!company || !year || !ctx) return needsCompany;
  const bs = report.data;
  const sides = bs && balanceSheetSides(bs);
  const rows = sides ? indexed(sideBySide(sides.left, sides.right)) : [];
  const columns = sideColumns('Liabilities', 'Assets');

  return (
    <ReportShell
      screenId="rBS"
      title="Balance Sheet"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={<AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />}
      csv={() =>
        sides && {
          fileName: 'balance-sheet.csv',
          text: toCsv(columns, rows, { title: [company.name, year.label, `Balance sheet as on ${asOn}`], footer: ['Total', sides.leftTotal, 'Total', sides.rightTotal] }),
        }
      }
    >
      {bs && bs.difference !== '0.00' && (
        <p role="alert" className="err">
          The balance sheet does not balance: assets and liabilities differ by {formatInr(bs.difference.replace('-', ''))}.
        </p>
      )}
      {sides && (
        <DataTable
          caption="Balance sheet"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.i)}
          emptyText="Nothing to show"
          footer={{ left: 'Total', leftAmount: formatInr(sides.leftTotal), right: 'Total', rightAmount: formatInr(sides.rightTotal) }}
        />
      )}
    </ReportShell>
  );
}
