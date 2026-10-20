import { useState } from 'react';
import { createBook } from '../api/endpoints';
import type { BookLite } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const TYPES = [
  { id: 'cash', label: 'Cash book' },
  { id: 'bank', label: 'Bank book' },
  { id: 'journal', label: 'Journal book' },
];

export function BookScreen() {
  const api = useApi();
  const company = useSession().company;
  const lookups = useLookups();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const needsLedger = type === 'cash' || type === 'bank';
  const columns: Column<BookLite>[] = [
    { key: 'code', header: 'Code', value: (b) => b.code },
    { key: 'name', header: 'Book', value: (b) => b.name },
    { key: 'type', header: 'Type', value: (b) => b.type },
    { key: 'ledger', header: 'Ledger', value: (b) => lookups.ledgers.find((l) => l.id === b.defaultLedgerId)?.name ?? '' },
  ];

  async function save() {
    const found: string[] = [];
    if (!code.trim()) found.push('Enter a book code');
    if (!name.trim()) found.push('Enter the book name');
    if (!type) found.push('Choose the type of book');
    if (needsLedger && !ledgerId) found.push('Choose the cash or bank ledger of this book');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !company) return;
    try {
      await createBook(api, company.id, { code: code.trim(), name: name.trim(), type: type!, ...(needsLedger ? { defaultLedgerId: ledgerId! } : {}) });
      const saved = name.trim();
      setCode('');
      setName('');
      setType(null);
      setLedgerId(null);
      setFormKey((k) => k + 1);
      setStatus(`Book "${saved}" created`);
      await lookups.reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('books', { save: requestSave });

  if (!company) return <p className="panel">Choose a company first (F9).</p>;

  return (
    <div>
      <h2>Book Master</h2>
      <NavRoot key={formKey} className="panel" onLast={requestSave}>
        <div className="form-row">
          <Field label="Code">
            <input aria-label="Code" data-nav="" autoFocus value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
          </Field>
          <Field label="Name">
            <input aria-label="Name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
          </Field>
          <Field label="Type">
            <Lookup label="Type" items={TYPES} value={type} onChange={setType} />
          </Field>
          {needsLedger && (
            <Field label="Cash or bank ledger">
              <Lookup label="Cash or bank ledger" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} />
            </Field>
          )}
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
          Create book <kbd>Ctrl+S</kbd>
        </button>
      </NavRoot>
      <div className="panel">
        <DataTable caption="Books" columns={columns} rows={lookups.books} rowKey={(b) => b.id} emptyText="No books yet" />
      </div>
    </div>
  );
}
