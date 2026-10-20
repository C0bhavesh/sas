import { useMemo, useState } from 'react';
import { createLedger } from '../api/endpoints';
import type { LedgerLite } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const COLUMNS: Column<LedgerLite>[] = [
  { key: 'name', header: 'Account', value: (l) => l.name },
  { key: 'group', header: 'Group', value: (l) => l.groupName },
  { key: 'city', header: 'City', value: (l) => l.city ?? '' },
  { key: 'gstin', header: 'GSTIN', value: (l) => l.gstin ?? '' },
  { key: 'status', header: 'Status', value: (l) => l.status },
];

export function LedgerScreen() {
  const api = useApi();
  const session = useSession();
  const lookups = useLookups();
  const company = session.company;

  const [groupId, setGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [creditDays, setCreditDays] = useState('');
  const [address, setAddress] = useState('');
  const [filter, setFilter] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const groupItems = useMemo(() => lookups.groups.map((g) => ({ id: g.id, label: g.name, sub: String(g.code) })), [lookups.groups]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? lookups.ledgers.filter((l) => `${l.name} ${l.city ?? ''} ${l.groupName}`.toLowerCase().includes(q)) : lookups.ledgers;
  }, [lookups.ledgers, filter]);

  function clear() {
    setGroupId(null);
    setName('');
    setCity('');
    setGstin('');
    setPan('');
    setCreditDays('');
    setAddress('');
    setProblems([]);
    setFormKey((k) => k + 1); // remounts the form so the cursor returns to the group
  }

  async function save() {
    const group = lookups.groups.find((g) => g.id === groupId);
    const found: string[] = [];
    if (!group) found.push('Choose the group');
    if (!name.trim()) found.push('Enter the account name');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !company) return;
    try {
      await createLedger(api, company.id, {
        groupCode: group!.code,
        name: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
        ...(pan.trim() ? { pan: pan.trim() } : {}),
        ...(creditDays ? { creditDays: Number(creditDays) } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      });
      const saved = name.trim();
      clear();
      setStatus(`Account "${saved}" created`);
      await lookups.reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }

  const requestSave = useCommittedAction(save);
  useScreenShortcuts('ledgers', { save: requestSave, new: clear });

  if (!company) return <p className="panel">Choose a company first (F9).</p>;

  return (
    <div>
      <h2>Account Master</h2>
      <NavRoot key={formKey} className="panel" onLast={requestSave}>
        <h3>New account</h3>
        <div className="form-row">
          <Field label="Group">
            <Lookup label="Group" items={groupItems} value={groupId} onChange={setGroupId} autoFocus />
          </Field>
          <Field label="Name">
            <input aria-label="Name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 280 }} />
          </Field>
          <Field label="City">
            <input aria-label="City" data-nav="" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <input aria-label="GSTIN" data-nav="" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </Field>
          <Field label="PAN">
            <input aria-label="PAN" data-nav="" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} style={{ width: 120 }} />
          </Field>
          <Field label="Credit days">
            <input aria-label="Credit days" data-nav="" inputMode="numeric" value={creditDays} onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ''))} style={{ width: 80 }} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Address">
            <input aria-label="Address" data-nav="" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: 520 }} />
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
          Create account
        </button>{' '}
        <span className="muted">Existing accounts cannot be edited yet.</span>
      </NavRoot>

      <div className="panel">
        <Field label="Find account">
          <input aria-label="Find account" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 280 }} />
        </Field>
        <DataTable caption="Accounts" columns={COLUMNS} rows={shown} rowKey={(l) => l.id} emptyText="No accounts match" />
      </div>
    </div>
  );
}
