import { useEffect, useMemo, useState } from 'react';
import { fromPaise, toPaise } from '@sas/shared';
import { listOpenings, setOpening, type OpeningRow } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { formatInr, normalizeAmount } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const SIDES = [
  { id: 'Dr', label: 'Dr', sub: 'debit' },
  { id: 'Cr', label: 'Cr', sub: 'credit' },
];

const COLUMNS: Column<OpeningRow>[] = [
  { key: 'name', header: 'Account', value: (r) => r.ledgerName },
  { key: 'group', header: 'Group', value: (r) => r.groupName },
  { key: 'dr', header: 'Debit', numeric: true, value: (r) => (r.side === 'Dr' ? formatInr(r.amount) : '') },
  { key: 'cr', header: 'Credit', numeric: true, value: (r) => (r.side === 'Cr' ? formatInr(r.amount) : '') },
];

export function OpeningScreen() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();

  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [side, setSide] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function reload() {
    if (!company || !year) return;
    try {
      setRows(await listOpenings(api, company.id, year.id));
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  const sums = useMemo(() => {
    let dr = 0n;
    let cr = 0n;
    for (const r of rows) (r.side === 'Dr' ? (dr += toPaise(r.amount)) : (cr += toPaise(r.amount)));
    return { dr, cr, diff: dr - cr };
  }, [rows]);

  async function save() {
    const found: string[] = [];
    if (!ledgerId) found.push('Choose the account');
    if (!normalizeAmount(amount) || toPaise(normalizeAmount(amount)) <= 0n) found.push('Enter the amount');
    if (side !== 'Dr' && side !== 'Cr') found.push('Choose Dr or Cr');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !year) return;
    try {
      await setOpening(api, ledgerId!, { yearId: year.id, amount: normalizeAmount(amount), side: side as 'Dr' | 'Cr' });
      const name = lookups.ledgers.find((l) => l.id === ledgerId)?.name ?? '';
      setLedgerId(null);
      setAmount('');
      setSide(null);
      setFormKey((k) => k + 1);
      setStatus(`Opening balance saved for ${name}`);
      await reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('openings', { save: requestSave });

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const open = year.status === 'open';

  return (
    <div>
      <h2>Opening Balances — {year.label}</h2>
      {!open ? (
        <p className="muted">Year {year.label} is {year.status}, so its opening balances cannot be changed.</p>
      ) : (
        <NavRoot key={formKey} className="panel" onLast={requestSave}>
          <div className="form-row">
            <Field label="Account">
              <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} autoFocus />
            </Field>
            <Field label="Amount">
              <MoneyInput label="Amount" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Dr / Cr">
              <Lookup label="Dr or Cr" items={SIDES} value={side} onChange={setSide} style={{ width: 90 }} />
            </Field>
          </div>
          {problems.length > 0 && (
            <ul role="alert" className="err">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {status && (
            <p role="status" className="ok">
              {status}
            </p>
          )}
          <button className="primary" onClick={requestSave}>
            Save <kbd>Ctrl+S</kbd>
          </button>
        </NavRoot>
      )}
      <div className="panel">
        <DataTable
          caption="Opening balances"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.ledgerId}
          emptyText="No opening balances yet"
          footer={{ name: 'Total', dr: formatInr(fromPaise(sums.dr)), cr: formatInr(fromPaise(sums.cr)) }}
        />
        <p className={sums.diff === 0n ? 'ok' : 'err'}>
          {sums.diff === 0n ? 'The opening balances balance.' : `Difference ${formatInr(fromPaise(sums.diff < 0n ? -sums.diff : sums.diff))} ${sums.diff > 0n ? 'Dr' : 'Cr'}`}
        </p>
      </div>
    </div>
  );
}
