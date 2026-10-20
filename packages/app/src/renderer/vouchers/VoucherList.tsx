import { useEffect, useRef, useState } from 'react';
import { listVouchers } from '../api/endpoints';
import type { VoucherSummary } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { useNav } from '../shell/nav';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const LIMIT = 200;
const KIND_LABEL = { receipt: 'Receipt', payment: 'Payment', journal: 'Journal' } as const;

const COLUMNS: Column<VoucherSummary>[] = [
  { key: 'no', header: 'No.', value: (r) => String(r.voucherNo) },
  { key: 'date', header: 'Date', value: (r) => formatDisplay(r.date) },
  { key: 'kind', header: 'Type', value: (r) => KIND_LABEL[r.kind] },
  { key: 'book', header: 'Book', value: (r) => r.bookCode },
  { key: 'narration', header: 'Narration', value: (r) => r.narration ?? '' },
  { key: 'total', header: 'Amount', numeric: true, value: (r) => formatInr(r.total) },
];

export function VoucherList() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const nav = useNav();
  const tableRef = useRef<HTMLTableElement>(null);

  const [bookId, setBookId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year?.endDate ?? null);
  const [rows, setRows] = useState<VoucherSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!company || !year) return;
    setError(null);
    try {
      setRows(await listVouchers(api, company.id, { yearId: year.id, bookId: bookId ?? undefined, from: from ?? undefined, to: to ?? undefined, limit: LIMIT }));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  // Reload with the filters as they are once the field being typed in has been committed, then move into the table.
  const requestRun = useCommittedAction(async () => {
    await run();
    tableRef.current?.focus();
  });
  useScreenShortcuts('vouchers', { refresh: requestRun });

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };

  return (
    <div>
      <h2>Find Voucher</h2>
      <NavRoot className="panel" onLast={requestRun}>
        <div className="form-row">
          <Field label="Book">
            <Lookup label="Book" items={lookups.books.map((b) => ({ id: b.id, label: b.name, sub: b.code }))} value={bookId} onChange={setBookId} />
          </Field>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
        </div>
      </NavRoot>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {loaded && !error && rows.length === 0 && <p className="muted">No vouchers found for these filters.</p>}
      {rows.length >= LIMIT && <p className="muted">Showing the newest {LIMIT}. Narrow the dates or pick a book to see others.</p>}
      {rows.length > 0 && (
        <DataTable
          caption="Vouchers"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          tableRef={tableRef}
          onOpen={(r) => nav.open(r.kind, { editId: r.id })}
        />
      )}
    </div>
  );
}
