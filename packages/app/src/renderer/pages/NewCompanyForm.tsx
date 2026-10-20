import { useMemo, useState } from 'react';
import { createCompany } from '../api/endpoints';
import type { ShortcutDecl } from '../keys/registry';
import { useShortcuts } from '../keys/useShortcuts';
import { useApi } from '../session/deps';
import { todayIso, type DateCtx } from '../ui/dates';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

/** The April-to-March year that contains `now`. */
export function defaultFinancialYear(now: Date = new Date()): { label: string; start: string; end: string } {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    label: `${startYear}-${String(startYear + 1).slice(2)}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/** The create-company form, used by the Companies page and by the Company & Years screen. */
export function NewCompanyForm({
  shortcuts,
  onCreated,
  onCancel,
}: {
  /** Must declare `save`; `cancel` is bound too when `onCancel` is given. */
  shortcuts: ShortcutDecl[];
  onCreated: (companyId: string, name: string) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const api = useApi();
  const dflt = useMemo(() => defaultFinancialYear(), []);
  const ctx: DateCtx = { yearStart: dflt.start, yearEnd: dflt.end, base: todayIso() };

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [label, setLabel] = useState(dflt.label);
  const [start, setStart] = useState<string | null>(dflt.start);
  const [end, setEnd] = useState<string | null>(dflt.end);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    const found: string[] = [];
    if (!code.trim()) found.push('Enter a company code');
    if (!name.trim()) found.push('Enter the company name');
    if (!label.trim()) found.push('Enter the name of the first financial year');
    if (!start || !end) found.push('Enter the first and last day of the financial year');
    else if (end <= start) found.push('The last day of the year must be after the first day');
    setProblems(found);
    setStatus(null);
    if (found.length > 0) return;
    try {
      const created = await createCompany(api, {
        code: code.trim(),
        name: name.trim(),
        ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
        ...(pan.trim() ? { pan: pan.trim() } : {}),
        ...(stateCode.trim() ? { stateCode: stateCode.trim() } : {}),
        fyLabel: label.trim(),
        fyStart: start!,
        fyEnd: end!,
      });
      const createdName = name.trim();
      setStatus(`Company "${createdName}" created`);
      setCode('');
      setName('');
      setGstin('');
      setPan('');
      setStateCode('');
      await onCreated(created.companyId, createdName);
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }

  const requestSave = useCommittedAction(save);
  useShortcuts(shortcuts, onCancel ? { save: requestSave, cancel: onCancel } : { save: requestSave });

  return (
    <NavRoot className="panel" onLast={requestSave}>
      <h3>New company</h3>
      <div className="form-row">
        <Field label="Code">
          <input aria-label="Code" data-nav="" autoFocus value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
        </Field>
        <Field label="Company name">
          <input aria-label="Company name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 300 }} />
        </Field>
        <Field label="GSTIN">
          <input aria-label="GSTIN" data-nav="" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
        </Field>
        <Field label="PAN">
          <input aria-label="PAN" data-nav="" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} style={{ width: 120 }} />
        </Field>
        <Field label="State code">
          <input aria-label="State code" data-nav="" value={stateCode} onChange={(e) => setStateCode(e.target.value)} style={{ width: 70 }} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Year name">
          <input aria-label="Year name" data-nav="" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: 100 }} />
        </Field>
        <Field label="First day">
          <DateInput label="First day" value={start} ctx={ctx} onChange={setStart} />
        </Field>
        <Field label="Last day">
          <DateInput label="Last day" value={end} ctx={ctx} onChange={setEnd} />
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
        Create company <kbd>Ctrl+S</kbd>
      </button>
    </NavRoot>
  );
}
