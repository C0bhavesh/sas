import { useEffect, useMemo, useState } from 'react';
import {
  closeYear,
  listBackups,
  lockYear,
  reopenYear,
  restoreBackup,
  runBackup,
  setFreeze,
  type BackupFile,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { nextYearSuggestion } from './yearSuggestion';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fileTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const BACKUP_COLUMNS: Column<BackupFile>[] = [
  { key: 'name', header: 'Backup', value: (b) => b.name },
  { key: 'when', header: 'Made', value: (b) => fileTime(b.modified) },
  { key: 'size', header: 'Size', numeric: true, value: (b) => `${Math.max(1, Math.round(b.size / 1024))} KB` },
];

export function UtilitiesScreen() {
  const api = useApi();
  const session = useSession();
  const { company, year } = session;

  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fail = (e: unknown) => setProblems([messageOf(e)]);
  const clear = () => {
    setProblems([]);
    setStatus(null);
  };

  // ---- freeze
  const [freeze, setFreezeDate] = useState<string | null>(company?.freezeDate ?? null);
  useEffect(() => setFreezeDate(company?.freezeDate ?? null), [company?.id, company?.freezeDate]);
  const ctx: DateCtx | null = year ? { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) } : null;

  const applyFreeze = useCommittedAction(async () => {
    if (!company) return;
    clear();
    if (!freeze) return setProblems(['Enter the date up to which entries are frozen']);
    try {
      await setFreeze(api, company.id, freeze);
      await session.refreshCompanies();
      setStatus(`Entries up to ${formatDisplay(freeze)} are now frozen`);
    } catch (e) {
      fail(e);
    }
  });
  async function removeFreeze() {
    if (!company) return;
    clear();
    try {
      await setFreeze(api, company.id, null);
      await session.refreshCompanies();
      setStatus('The freeze was removed');
    } catch (e) {
      fail(e);
    }
  }

  // ---- year-end
  const suggestion = useMemo(() => (year ? nextYearSuggestion(year) : null), [year]);
  const [nextLabel, setNextLabel] = useState('');
  const [nextStart, setNextStart] = useState<string | null>(null);
  const [nextEnd, setNextEnd] = useState<string | null>(null);
  useEffect(() => {
    setNextLabel(suggestion?.label ?? '');
    setNextStart(suggestion?.start ?? null);
    setNextEnd(suggestion?.end ?? null);
  }, [suggestion]);
  const [confirm, setConfirm] = useState<null | 'close' | 'lock' | 'restore'>(null);

  async function doClose() {
    setConfirm(null);
    if (!company || !year || !nextStart || !nextEnd) return;
    clear();
    try {
      const r = await closeYear(api, year.id, { companyId: company.id, next: { label: nextLabel.trim(), start: nextStart, end: nextEnd } });
      await session.reloadYears();
      setStatus(`Year ${year.label} closed. Net profit ${formatInr(r.netProfit)}. ${r.carriedLedgers} balances and ${r.carriedBills} pending bills carried to ${nextLabel.trim()}.`);
    } catch (e) {
      fail(e);
    }
  }
  async function doReopen() {
    if (!company || !year) return;
    clear();
    try {
      await reopenYear(api, year.id, company.id);
      await session.reloadYears();
      setStatus(`Year ${year.label} is open again`);
    } catch (e) {
      fail(e);
    }
  }
  async function doLock() {
    setConfirm(null);
    if (!company || !year) return;
    clear();
    try {
      await lockYear(api, year.id, company.id);
      await session.reloadYears();
      setStatus(`Year ${year.label} is locked`);
    } catch (e) {
      fail(e);
    }
  }

  // ---- backup and restore
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [backupsOff, setBackupsOff] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  async function loadBackups() {
    try {
      setBackups(await listBackups(api));
      setBackupsOff(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_CONFIGURED') setBackupsOff(true);
      else fail(e);
    }
  }
  useEffect(() => {
    void loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function backupNow() {
    clear();
    try {
      const r = await runBackup(api);
      setStatus(`Backup saved: ${r.file}`);
      await loadBackups();
    } catch (e) {
      fail(e);
    }
  }
  function askRestore() {
    clear();
    if (!backupPath) return setProblems(['Choose the backup file to restore']);
    if (!password) return setProblems(['Enter your password to confirm']);
    setConfirm('restore');
  }
  async function doRestore() {
    setConfirm(null);
    if (!backupPath) return;
    try {
      await restoreBackup(api, backupPath, password);
      session.logout(); // a restore also rolls back the sign-in records, so everyone must sign in again
    } catch (e) {
      fail(e);
    }
  }

  if (!company || !year || !ctx) return <p className="panel">Choose a company and year first (F9).</p>;
  const backupItems = (backups ?? []).map((b) => ({ id: b.path, label: b.name, sub: fileTime(b.modified) }));

  return (
    <div>
      <h2>Year-end, Freeze & Backup</h2>

      <section className="panel" aria-label="Freeze entries">
        <h3>Freeze entries</h3>
        <p className="muted">
          {company.freezeDate ? `Entries up to ${formatDisplay(company.freezeDate)} are frozen: nobody can add, change or delete them.` : 'Nothing is frozen.'}
        </p>
        <div className="form-row">
          <Field label="Freeze entries up to">
            <DateInput label="Freeze entries up to" value={freeze} ctx={ctx} onChange={setFreezeDate} />
          </Field>
          <button className="primary" onClick={applyFreeze}>
            Set freeze date
          </button>
          {company.freezeDate && <button onClick={() => void removeFreeze()}>Remove freeze</button>}
        </div>
      </section>

      <section className="panel" aria-label="Year-end">
        <h3>Year {year.label}</h3>
        {year.status === 'open' && (
          <>
            <p className="muted">Closing the year stops new entries in it and carries the balances and pending bills into the next year. You can reopen it until it is locked.</p>
            <div className="form-row">
              <Field label="Next year name">
                <input aria-label="Next year name" value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} style={{ width: 110 }} />
              </Field>
              <Field label="First day">
                <DateInput label="Next year first day" value={nextStart} ctx={{ ...ctx, yearStart: nextStart ?? ctx.yearStart, yearEnd: nextEnd ?? ctx.yearEnd }} onChange={setNextStart} />
              </Field>
              <Field label="Last day">
                <DateInput label="Next year last day" value={nextEnd} ctx={{ ...ctx, yearStart: nextStart ?? ctx.yearStart, yearEnd: nextEnd ?? ctx.yearEnd }} onChange={setNextEnd} />
              </Field>
              <button className="primary" onClick={() => setConfirm('close')}>
                Close year {year.label}
              </button>
            </div>
          </>
        )}
        {year.status === 'closed' && (
          <>
            <p className="muted">Year {year.label} is closed.</p>
            <button onClick={() => void doReopen()}>Reopen year {year.label}</button>{' '}
            <button onClick={() => setConfirm('lock')}>Lock year {year.label} permanently</button>
          </>
        )}
        {year.status === 'locked' && <p className="muted">Year {year.label} is locked. It cannot be changed or reopened.</p>}
      </section>

      <section className="panel" aria-label="Backup">
        <h3>Backup and restore</h3>
        {backupsOff ? (
          <p className="muted">Backup is not set up on this server. Ask whoever installed it to set the backup folder.</p>
        ) : (
          <>
            <p>
              <button className="primary" onClick={() => void backupNow()}>
                Back up now
              </button>
            </p>
            <DataTable caption="Backups" columns={BACKUP_COLUMNS} rows={backups ?? []} rowKey={(b) => b.path} emptyText="No backups yet" />
            <h3 style={{ marginTop: 12 }}>Restore</h3>
            <p className="muted">Restoring replaces all current data with the chosen backup, and everyone must sign in again afterwards.</p>
            <div className="form-row">
              <Field label="Backup file">
                <Lookup label="Backup file" items={backupItems} value={backupPath} onChange={setBackupPath} />
              </Field>
              <Field label="Your password">
                <input aria-label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <button onClick={askRestore}>Restore…</button>
            </div>
          </>
        )}
      </section>

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

      {confirm === 'close' && (
        <ConfirmDialog
          title={`Close year ${year.label}`}
          message={`No more vouchers can be entered in ${year.label}. Balances and pending bills move to ${nextLabel}. You can reopen the year later, until it is locked.`}
          confirmLabel="Close year"
          onConfirm={() => void doClose()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'lock' && (
        <ConfirmDialog
          title={`Lock year ${year.label}`}
          message={`A locked year can never be changed or reopened. This cannot be undone.`}
          confirmLabel="Lock year"
          onConfirm={() => void doLock()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'restore' && (
        <ConfirmDialog
          title="Restore backup"
          message="This replaces all current data with the chosen backup and signs everyone out. Entries made after the backup are lost."
          confirmLabel="Restore"
          onConfirm={() => void doRestore()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
