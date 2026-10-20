import { useEffect, useRef, useState } from 'react';
import { toPaise, type VoucherKind } from '@sas/shared';
import { ApiError } from '../api/client';
import { deleteVoucher, getVoucher, saveVoucher, updateVoucher } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { useNav } from '../shell/nav';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { clampToYear, todayIso, type DateCtx } from '../ui/dates';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr, normalizeAmount } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { BillAdjuster } from './BillAdjuster';
import {
  emptyForm,
  formFromVoucher,
  isBlank,
  newLine,
  onAccountOf,
  suggestNextLine,
  toSavePayload,
  toUpdatePayload,
  totals,
  validateForm,
  type FormLine,
  type VoucherForm,
} from './form';

const TITLES: Record<VoucherKind, string> = {
  receipt: 'Cash / Bank Receipt',
  payment: 'Cash / Bank Payment',
  journal: 'Journal Voucher',
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function VoucherEntry({ kind, editId }: { kind: VoucherKind; editId?: string }) {
  const session = useSession();
  const lookups = useLookups();
  if (!session.company || !session.year) return <p className="panel">Choose a company and year first (F9).</p>;
  if (lookups.loading) return <p className="panel">Loading accounts…</p>;
  return <VoucherEditor kind={kind} editId={editId} companyId={session.company.id} yearId={session.year.id} yearStart={session.year.startDate} yearEnd={session.year.endDate} />;
}

function VoucherEditor(props: { kind: VoucherKind; editId?: string; companyId: string; yearId: string; yearStart: string; yearEnd: string }) {
  const { kind, editId, companyId, yearId, yearStart, yearEnd } = props;
  const api = useApi();
  const lookups = useLookups();
  const nav = useNav();

  const ctx: DateCtx = { yearStart, yearEnd, base: clampToYear(todayIso(), yearStart, yearEnd) };
  const books = lookups.booksFor(kind);
  const startOnBook = useRef(books.length !== 1 && !editId).current;

  const [form, setForm] = useState<VoucherForm>(() =>
    emptyForm(kind, { bookId: books.length === 1 ? books[0]!.id : null, date: ctx.base }),
  );
  const [loading, setLoading] = useState(!!editId);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [billsKey, setBillsKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveTick, setSaveTick] = useState(0);
  const lastFocus = useRef<HTMLElement | null>(null);

  // ---- loading an existing voucher
  async function load(id: string) {
    try {
      setForm(formFromVoucher(await getVoucher(api, id)));
      setProblems([]);
      setStale(false);
    } catch (e) {
      setProblems([messageOf(e)]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (editId) void load(editId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ---- put the cursor on a line's account after the form has re-rendered
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector<HTMLElement>(`[data-line="${focusKey}"][data-field="account"]`)?.focus();
    setFocusKey(null);
  }, [focusKey, form.lines]);

  const setLine = (key: string, patch: Partial<FormLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  function addLine() {
    const last = form.lines[form.lines.length - 1];
    if (last && isBlank(last)) return;
    const s = suggestNextLine(form);
    const line = newLine(kind, s.side, s.amount);
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setFocusKey(line.key);
  }

  function deleteLine() {
    const key = currentKey ?? form.lines[form.lines.length - 1]?.key;
    if (!key) return;
    if (form.lines.length === 1) {
      const fresh = newLine(kind);
      setForm((f) => ({ ...f, lines: [fresh] }));
      setFocusKey(fresh.key);
      return;
    }
    const idx = form.lines.findIndex((l) => l.key === key);
    const remaining = form.lines.filter((l) => l.key !== key);
    setForm((f) => ({ ...f, lines: remaining }));
    setCurrentKey(null);
    setFocusKey(remaining[Math.max(0, idx - 1)]!.key);
  }

  function newVoucher() {
    if (form.editing) {
      nav.open(kind);
      return;
    }
    const next = emptyForm(kind, { bookId: form.bookId, date: form.date });
    setForm(next);
    setProblems([]);
    setStatus(null);
    setFocusKey(next.lines[0]!.key);
  }

  function openBills(key?: string) {
    const wanted = key ?? currentKey;
    const line = form.lines.find((l) => l.key === wanted) ?? form.lines[form.lines.length - 1];
    if (!line || !line.ledgerId) {
      setProblems(['Choose the account first, then press Ctrl+B for its bills']);
      return;
    }
    let positive = false;
    try {
      positive = toPaise(normalizeAmount(line.amount) || '0') > 0n;
    } catch {
      positive = false;
    }
    if (!positive) {
      setProblems(['Enter the amount first, then press Ctrl+B for its bills']);
      return;
    }
    setProblems([]);
    setBillsKey(line.key);
  }

  // ---- saving. Ctrl+S first leaves the field being typed in, so a date or amount that is still
  // uncommitted is part of the form when it is checked.
  function requestSave() {
    lastFocus.current = document.activeElement as HTMLElement | null;
    lastFocus.current?.blur();
    setSaveTick((t) => t + 1);
  }
  useEffect(() => {
    if (saveTick > 0) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick]);

  async function save() {
    const found = validateForm(form);
    setProblems(found);
    setStatus(null);
    if (found.length > 0) {
      lastFocus.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (form.editing) {
        await updateVoucher(api, form.editing.voucherId, toUpdatePayload(form));
        const fresh = await getVoucher(api, form.editing.voucherId);
        setForm(formFromVoucher(fresh));
        setStatus(`Voucher no. ${fresh.voucherNo} updated`);
      } else {
        const result = await saveVoucher(api, toSavePayload(form, { companyId, yearId }));
        const next = emptyForm(kind, { bookId: form.bookId, date: form.date });
        setForm(next);
        setStatus(`Saved as voucher no. ${result.voucherNo}`);
        setFocusKey(next.lines[0]!.key);
      }
      setStale(false);
    } catch (e) {
      setProblems([messageOf(e)]);
      setStale(e instanceof ApiError && e.code === 'STALE_VERSION');
      lastFocus.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function confirmedDelete() {
    if (!form.editing) return;
    setConfirmDelete(false);
    try {
      await deleteVoucher(api, form.editing.voucherId, form.editing.version);
      nav.back();
    } catch (e) {
      setProblems([messageOf(e)]);
      setStale(e instanceof ApiError && e.code === 'STALE_VERSION');
    }
  }

  useScreenShortcuts(
    kind,
    {
      save: requestSave,
      bills: () => openBills(),
      deleteLine,
      newVoucher,
      deleteVoucher: () => form.editing && setConfirmDelete(true),
    },
    !billsKey && !confirmDelete,
  );

  if (loading) return <p className="panel">Loading voucher…</p>;

  const t = totals(form);
  const billsLine = form.lines.find((l) => l.key === billsKey);

  return (
    <>
      <NavRoot onLast={addLine} className="panel voucher-grid">
        <h2>
          {TITLES[kind]}
          {form.editing ? ` — no. ${form.editing.voucherNo}` : ''}
        </h2>
        <div className="form-row">
          <Field label="Book">
            <Lookup
              label="Book"
              items={lookups.bookItems(kind)}
              value={form.bookId}
              onChange={(id) => setForm((f) => ({ ...f, bookId: id }))}
              disabled={!!form.editing}
              autoFocus={startOnBook}
            />
          </Field>
          <Field label="Date">
            <DateInput label="Date" value={form.date} ctx={ctx} onChange={(iso) => setForm((f) => ({ ...f, date: iso }))} autoFocus={!startOnBook} />
          </Field>
          <Field label="Narration">
            <input
              aria-label="Narration"
              data-nav=""
              style={{ width: 320 }}
              value={form.narration}
              onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))}
            />
          </Field>
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Account</th>
              {kind === 'journal' ? (
                <>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </>
              ) : (
                <th className="num">Amount</th>
              )}
              <th>Narration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, i) => {
              const n = i + 1;
              return (
                <tr key={line.key} onFocusCapture={() => setCurrentKey(line.key)}>
                  <td>{n}</td>
                  <td className="account">
                    <Lookup
                      label={`Account line ${n}`}
                      items={lookups.ledgerItems}
                      value={line.ledgerId}
                      onChange={(id) => setLine(line.key, id === line.ledgerId ? {} : { ledgerId: id, adjustments: [] })}
                      data-line={line.key}
                      data-field="account"
                    />
                  </td>
                  {kind === 'journal' ? (
                    <>
                      <td className="num">
                        <MoneyInput label={`Debit line ${n}`} value={line.side === 'Dr' ? line.amount : ''} nav={line.side === 'Dr'} onChange={(v) => setLine(line.key, { side: 'Dr', amount: v })} />
                      </td>
                      <td className="num">
                        <MoneyInput label={`Credit line ${n}`} value={line.side === 'Cr' ? line.amount : ''} nav={line.side === 'Cr'} onChange={(v) => setLine(line.key, { side: 'Cr', amount: v })} />
                      </td>
                    </>
                  ) : (
                    <td className="num">
                      <MoneyInput label={`Amount line ${n}`} value={line.amount} onChange={(v) => setLine(line.key, { amount: v })} />
                    </td>
                  )}
                  <td>
                    <input aria-label={`Narration line ${n}`} data-nav="" value={line.narration} onChange={(e) => setLine(line.key, { narration: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" tabIndex={-1} aria-label={`Bills for line ${n}`} onClick={() => openBills(line.key)}>
                      Bills{line.adjustments.length > 0 ? ` (${line.adjustments.length})` : ''}
                    </button>
                    {line.adjustments.length > 0 && <div className="muted">On account {formatInr(onAccountOf(line))}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              {kind === 'journal' ? (
                <>
                  <td className="num">{formatInr(t.debit)}</td>
                  <td className="num">{formatInr(t.credit)}</td>
                </>
              ) : (
                <td className="num">{formatInr(t.total)}</td>
              )}
              <td colSpan={2} className={kind === 'journal' && t.difference !== '0.00' ? 'err' : 'muted'}>
                {kind === 'journal' ? (t.difference === '0.00' ? 'Balanced' : `Difference ${formatInr(t.difference)}`) : ''}
              </td>
            </tr>
          </tfoot>
        </table>

        {problems.length > 0 && (
          <ul role="alert" className="err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {stale && editId && (
          <p>
            <button onClick={() => void load(editId)}>Reload voucher</button>
          </p>
        )}
        {status && (
          <p role="status" className="ok">
            {status}
          </p>
        )}
        <p>
          <button className="primary" disabled={busy} onClick={requestSave}>
            {form.editing ? 'Update' : 'Save'}
          </button>
        </p>
      </NavRoot>

      {billsLine && billsLine.ledgerId && (
        <BillAdjuster
          companyId={companyId}
          ledgerId={billsLine.ledgerId}
          ledgerName={lookups.ledgers.find((l) => l.id === billsLine.ledgerId)?.name ?? ''}
          lineSide={billsLine.side}
          lineAmount={normalizeAmount(billsLine.amount)}
          current={billsLine.adjustments}
          onCancel={() => setBillsKey(null)}
          onDone={(adjustments) => {
            setLine(billsLine.key, { adjustments });
            setBillsKey(null);
          }}
        />
      )}
      {confirmDelete && form.editing && (
        <ConfirmDialog
          title="Delete voucher"
          message={`Delete voucher no. ${form.editing.voucherNo}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmedDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
