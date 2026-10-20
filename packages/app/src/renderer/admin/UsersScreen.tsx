import { useEffect, useState } from 'react';
import { MODULES, NO_RIGHTS, type ModuleName, type RightAction } from '@sas/shared';
import {
  createUser,
  getUserAccess,
  getUserRights,
  listUsers,
  setBlockedGroups,
  setHiddenCompanies,
  setUserRights,
  setUserStatus,
  type RightsMap,
  type UserRow,
} from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const MODULE_LABELS: Record<ModuleName, string> = {
  company: 'Company & years',
  account_master: 'Account master',
  group_master: 'Group master',
  book_master: 'Book master',
  cash_book: 'Cash / bank vouchers',
  journal: 'Journal vouchers',
  reports: 'Reports',
  users: 'Users & rights',
  utilities: 'Year-end, freeze & backup',
};
const ACTION_LABELS: Record<RightAction, string> = { show: 'Show in menu', find: 'View', add: 'Add', edit: 'Edit', delete: 'Delete', print: 'Print' };
const ACTION_ORDER: RightAction[] = ['show', 'find', 'add', 'edit', 'delete', 'print'];

/** Keep blocks that belong to other companies; replace the current company's with `selected`. */
export function mergeBlocked(existing: string[], companyGroupIds: string[], selected: string[]): string[] {
  const mine = new Set(companyGroupIds);
  return [...existing.filter((id) => !mine.has(id)), ...selected];
}

const COLUMNS: Column<UserRow>[] = [
  { key: 'username', header: 'User', value: (u) => u.username },
  { key: 'role', header: 'Role', value: (u) => (u.isAdmin ? 'Administrator' : 'User') },
  { key: 'status', header: 'Status', value: (u) => u.status },
];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function UsersScreen() {
  const api = useApi();
  const session = useSession();
  const lookups = useLookups();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [rights, setRights] = useState<RightsMap | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]); // hidden groups of the current company (what the checkboxes show)
  const [otherBlocked, setOtherBlocked] = useState<string[]>([]); // hidden groups of other companies, kept as they are
  const [hiddenCompanies, setHiddenCompaniesState] = useState<string[]>([]);
  const companyGroupIds = lookups.groups.map((g) => g.id);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '', isAdmin: false, canExportAudit: false });
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function loadUsers() {
    try {
      setUsers(await listUsers(api));
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }
  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function select(u: UserRow) {
    setCreating(false);
    setSelected(u);
    setRights(null);
    setProblems([]);
    setStatus(null);
    try {
      const [r, a] = await Promise.all([getUserRights(api, u.id), getUserAccess(api, u.id)]);
      setRights(r);
      setBlocked(a.blockedGroupIds.filter((id) => companyGroupIds.includes(id)));
      setOtherBlocked(a.blockedGroupIds.filter((id) => !companyGroupIds.includes(id)));
      setHiddenCompaniesState(a.hiddenCompanyIds);
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }

  async function save() {
    setProblems([]);
    setStatus(null);
    try {
      if (creating) {
        const found: string[] = [];
        if (!form.username.trim()) found.push('Enter a username');
        if (!form.password) found.push('Enter a password');
        if (found.length > 0) return setProblems(found);
        const { id } = await createUser(api, {
          username: form.username.trim(),
          password: form.password,
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.isAdmin ? { isAdmin: true } : {}),
          ...(form.canExportAudit ? { canExportAudit: true } : {}),
        });
        await loadUsers();
        setStatus(`User ${form.username.trim()} created`);
        setForm({ username: '', password: '', email: '', isAdmin: false, canExportAudit: false });
        setCreating(false);
        const fresh = (await listUsers(api)).find((u) => u.id === id);
        if (fresh) await select(fresh);
        return;
      }
      if (!selected || !rights || selected.isAdmin) return;
      await setUserRights(api, selected.id, rights);
      await setBlockedGroups(api, selected.id, mergeBlocked(otherBlocked, companyGroupIds, blocked));
      await setHiddenCompanies(api, selected.id, hiddenCompanies);
      setStatus(`Saved ${selected.username}`);
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('users', {
    save: requestSave,
    new: () => {
      setCreating(true);
      setSelected(null);
      setProblems([]);
      setStatus(null);
    },
  });

  async function toggleStatus() {
    if (!selected) return;
    const next = selected.status === 'active' ? 'blocked' : 'active';
    try {
      await setUserStatus(api, selected.id, next);
      await loadUsers();
      setSelected({ ...selected, status: next });
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }

  const isSelf = selected?.id === session.actor.userId;

  return (
    <div>
      <h2>Users & Rights</h2>
      <div className="panel">
        <DataTable caption="Users" columns={COLUMNS} rows={users} rowKey={(u) => u.id} onOpen={(u) => void select(u)} emptyText="No users" />
        <p className="muted">Press Enter on a user to edit them, or Ctrl+N for a new user.</p>
      </div>

      {creating && (
        <NavRoot className="panel" onLast={requestSave}>
          <h3>New user</h3>
          <div className="form-row">
            <Field label="Username">
              <input aria-label="Username" data-nav="" autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Password">
              <input aria-label="Password" data-nav="" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Email (optional)">
              <input aria-label="Email" data-nav="" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <label>
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} /> Administrator
          </label>{' '}
          <label>
            <input type="checkbox" checked={form.canExportAudit} onChange={(e) => setForm({ ...form, canExportAudit: e.target.checked })} /> May export the audit log
          </label>
          <p>
            <button className="primary" onClick={requestSave}>
              Create user <kbd>Ctrl+S</kbd>
            </button>
          </p>
        </NavRoot>
      )}

      {selected && rights && (
        <div className="panel">
          <h3>{selected.username}</h3>
          <p>
            <button disabled={isSelf} onClick={() => void toggleStatus()}>
              {selected.status === 'active' ? 'Block this user' : 'Unblock this user'}
            </button>{' '}
            {isSelf && <span className="muted">You cannot block yourself.</span>}
          </p>
          {selected.isAdmin && <p className="muted">Administrators can do everything, so their rights are not editable.</p>}
          <table className="data">
            <thead>
              <tr>
                <th>Module</th>
                {ACTION_ORDER.map((a) => (
                  <th key={a}>{ACTION_LABELS[a]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ACTION_ORDER.map((a) => (
                    <td key={a}>
                      <input
                        type="checkbox"
                        aria-label={`${MODULE_LABELS[m]}: ${ACTION_LABELS[a]}`}
                        disabled={selected.isAdmin}
                        checked={rights[m]?.[a] ?? NO_RIGHTS[a]}
                        onChange={(e) => setRights({ ...rights, [m]: { ...(rights[m] ?? NO_RIGHTS), [a]: e.target.checked } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 12 }}>Hide account groups ({session.company?.name})</h3>
          <div className="form-row">
            {lookups.groups.map((g) => (
              <label key={g.id}>
                <input
                  type="checkbox"
                  aria-label={`Hide group ${g.name}`}
                  disabled={selected.isAdmin}
                  checked={blocked.includes(g.id)}
                  onChange={(e) => setBlocked(e.target.checked ? [...blocked, g.id] : blocked.filter((id) => id !== g.id))}
                />{' '}
                {g.name}
              </label>
            ))}
          </div>

          <h3>Hide companies</h3>
          <div className="form-row">
            {session.companies.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`Hide company ${c.name}`}
                  disabled={selected.isAdmin}
                  checked={hiddenCompanies.includes(c.id)}
                  onChange={(e) => setHiddenCompaniesState(e.target.checked ? [...hiddenCompanies, c.id] : hiddenCompanies.filter((id) => id !== c.id))}
                />{' '}
                {c.name}
              </label>
            ))}
          </div>

          {!selected.isAdmin && (
            <button className="primary" onClick={requestSave}>
              Save <kbd>Ctrl+S</kbd>
            </button>
          )}
        </div>
      )}

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
    </div>
  );
}
