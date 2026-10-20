import { useEffect, useRef, useState } from 'react';
import { listYearSummaries } from '../api/endpoints';
import type { YearSummary } from '../api/types';
import { useShortcuts } from '../keys/useShortcuts';
import { useApi, useDeps } from '../session/deps';
import { useSession } from '../session/Session';
import { PAGE_SHORTCUTS } from '../shell/screens';
import { DataTable } from '../ui/DataTable';
import { formatDisplay } from '../ui/dates';
import { formatInr } from '../ui/format';
import { PageFrame } from './PageFrame';

const count = (n: number) => formatInr(String(n)).replace(/\.00$/, '');
const STATUS: Record<string, string> = { open: 'Open', closed: 'Closed', locked: 'Locked' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

export function YearsPage() {
  const api = useApi();
  const { bridge } = useDeps();
  const session = useSession();
  const company = session.company!;
  const [rows, setRows] = useState<YearSummary[] | null>(null);
  const [initial, setInitial] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [summaries, cfg] = await Promise.all([listYearSummaries(api, company.id), bridge.getConfig()]);
        if (!alive) return;
        setInitial(Math.max(0, summaries.findIndex((y) => y.id === cfg.lastYearId)));
        setRows(summaries);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, bridge, company.id]);

  useEffect(() => {
    if (rows) tableRef.current?.focus();
  }, [rows]);

  useShortcuts(PAGE_SHORTCUTS.years, { back: () => session.backToCompanies() });

  return (
    <PageFrame
      crumb={<span className="crumb">‹ {company.name} <kbd>Esc</kbd></span>}
      title="Financial years"
      subtitle="Pick a year to open its books."
    >
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {rows && (
        <DataTable
          caption="Years"
          tableRef={tableRef}
          initialActive={initial}
          rows={rows}
          rowKey={(y) => y.id}
          onOpen={(y) => session.openYear(y.id)}
          emptyText="This company has no financial years."
          columns={[
            { key: 'label', header: 'Year', value: (y) => y.label, render: (y) => <span className="serif year-label">{y.label}</span> },
            { key: 'period', header: 'Period', value: (y) => `${monthYear(y.startDate)} – ${monthYear(y.endDate)}` },
            { key: 'vouchers', header: 'Vouchers', numeric: true, value: (y) => count(y.voucherCount) },
            { key: 'accounts', header: 'Accounts', numeric: true, value: (y) => count(y.accountCount) },
            { key: 'last', header: 'Last entry', numeric: true, value: (y) => (y.lastEntryDate ? formatDisplay(y.lastEntryDate) : '—') },
            {
              key: 'status',
              header: 'Status',
              numeric: true,
              value: (y) => STATUS[y.status] ?? y.status,
              render: (y) => <span className={`status ${y.status}`}>● {STATUS[y.status] ?? y.status}</span>,
            },
          ]}
        />
      )}
      <p className="hint">
        <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> open year · <kbd>Esc</kbd> back to companies
      </p>
    </PageFrame>
  );
}
