import { useEffect, useMemo, useState } from 'react';
import { ADJUSTMENT_KINDS, fromPaise, toPaise, type AdjustmentKind, type BillAdjustmentInput, type Side } from '@sas/shared';
import { pendingBills } from '../api/endpoints';
import type { PendingBill } from '../api/types';
import { useShortcuts } from '../keys/useShortcuts';
import { useApi } from '../session/deps';
import { VOUCHER_KEYS } from '../shell/screens';
import { Dialog } from '../ui/Dialog';
import { formatInr, normalizeAmount } from '../ui/format';
import { formatDisplay } from '../ui/dates';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { allocateOldestFirst } from './form';

const KIND_LABELS: Record<AdjustmentKind, string> = {
  cash: 'Cash / bank',
  discount: 'Discount',
  rd: 'Rate difference',
  rg: 'Goods returned',
  claim: 'Claim',
  bc: 'Bank charges',
  interest: 'Interest',
  close: 'Close bill',
};

interface Row {
  amount: string;
  kind: AdjustmentKind;
}

const paise = (text: string): bigint => {
  try {
    return toPaise(normalizeAmount(text) || '0');
  } catch {
    return 0n;
  }
};

/** Match one voucher line to the party's pending bills. */
export function BillAdjuster(props: {
  companyId: string;
  ledgerId: string;
  ledgerName: string;
  lineSide: Side;
  lineAmount: string;
  current: BillAdjustmentInput[];
  onDone: (adjustments: BillAdjustmentInput[]) => void;
  onCancel: () => void;
}) {
  const { companyId, ledgerId, ledgerName, lineSide, lineAmount, current, onDone, onCancel } = props;
  const api = useApi();
  const [bills, setBills] = useState<PendingBill[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(current.map((a) => [a.billId, { amount: a.amount, kind: a.kind }])),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pendingBills(api, companyId, ledgerId)
      .then((all) => alive && setBills(all.filter((b) => b.side !== lineSide).sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo))))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [api, companyId, ledgerId, lineSide]);

  const adjusted = useMemo(() => Object.values(rows).reduce((sum, r) => sum + paise(r.amount), 0n), [rows]);
  const onAccount = paise(lineAmount) - adjusted;

  function autoFill() {
    if (!bills) return;
    const alloc = allocateOldestFirst(bills, lineAmount);
    setRows(Object.fromEntries(alloc.map((a) => [a.billId, { amount: a.amount, kind: 'cash' as AdjustmentKind }])));
    setError(null);
  }

  function done() {
    if (!bills) return;
    const chosen: BillAdjustmentInput[] = [];
    for (const bill of bills) {
      const row = rows[bill.id];
      if (!row || paise(row.amount) <= 0n) continue;
      if (paise(row.amount) > toPaise(bill.pending)) {
        setError(`Bill ${bill.billNo}: more than the pending ${bill.pending}`);
        return;
      }
      chosen.push({ billId: bill.id, amount: normalizeAmount(row.amount), kind: row.kind });
    }
    if (adjusted > paise(lineAmount)) {
      setError(`The bills add up to ${formatInr(fromPaise(adjusted))}, more than the line amount ${formatInr(lineAmount)}`);
      return;
    }
    onDone(chosen);
  }

  useShortcuts(VOUCHER_KEYS, { autoAllocate: autoFill, billsDone: done });

  return (
    <Dialog title={`Bills of ${ledgerName}`} onClose={onCancel} width={760}>
      {loadError && <p className="err" role="alert">{loadError}</p>}
      {!bills && !loadError && <p>Loading bills…</p>}
      {bills && bills.length === 0 && <p>This account has no pending bills to settle with this line.</p>}
      {bills && bills.length > 0 && (
        <NavRoot onLast={done}>
          <table className="data">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Date</th>
                <th className="num">Pending</th>
                <th className="num">Amount</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.billNo}</td>
                  <td>{formatDisplay(b.billDate)}</td>
                  <td className="num">{formatInr(b.pending)}</td>
                  <td className="num">
                    <MoneyInput
                      label={`Amount for bill ${b.billNo}`}
                      value={rows[b.id]?.amount ?? ''}
                      onChange={(v) => setRows((r) => ({ ...r, [b.id]: { kind: r[b.id]?.kind ?? 'cash', amount: v } }))}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Type for bill ${b.billNo}`}
                      value={rows[b.id]?.kind ?? 'cash'}
                      onChange={(e) => setRows((r) => ({ ...r, [b.id]: { amount: r[b.id]?.amount ?? '', kind: e.target.value as AdjustmentKind } }))}
                    >
                      {ADJUSTMENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NavRoot>
      )}
      <p>
        Line amount {formatInr(lineAmount)} · Adjusted {formatInr(fromPaise(adjusted))} · On account {formatInr(fromPaise(onAccount))}
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      <p>
        <button onClick={autoFill}>
          Fill from oldest
        </button>{' '}
        <button className="primary" onClick={done}>
          Done
        </button>{' '}
        <button onClick={onCancel}>Cancel</button>
      </p>
    </Dialog>
  );
}
