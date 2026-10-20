import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useShortcuts } from '../keys/useShortcuts';
import { useDeps } from '../session/deps';
import { useSession } from '../session/Session';
import { PAGE_SHORTCUTS } from '../shell/screens';
import { NewCompanyForm } from './NewCompanyForm';
import { PageFrame } from './PageFrame';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function CompaniesPage() {
  const session = useSession();
  const { bridge } = useDeps();
  const listRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(0);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const companies = session.companies;
  const canCreate = session.can('company', 'add');

  // Highlight the company used last time (or the one just created).
  useEffect(() => {
    void bridge.getConfig().then((cfg) => setHighlightId((id) => id ?? cfg.lastCompanyId));
  }, [bridge]);
  useEffect(() => {
    const i = companies.findIndex((c) => c.id === highlightId);
    if (i >= 0) setActive(i);
  }, [companies, highlightId]);

  useShortcuts(PAGE_SHORTCUTS.companies, { newCompany: () => setCreating(true) }, !creating && canCreate);
  useEffect(() => {
    listRef.current?.focus();
  }, [creating]);

  if (creating) {
    return (
      <PageFrame title="New company" subtitle="Enter the company and its first financial year.">
        <NewCompanyForm
          shortcuts={PAGE_SHORTCUTS.newCompany}
          onCancel={() => setCreating(false)}
          onCreated={async (companyId) => {
            await session.refreshCompanies();
            setHighlightId(companyId);
            setCreating(false);
          }}
        />
      </PageFrame>
    );
  }

  function open(id: string) {
    setError(null);
    session.enterCompany(id).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = companies.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(to, last)));
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Enter' && companies[active]) {
      e.preventDefault();
      open(companies[active]!.id);
    }
  }

  return (
    <PageFrame title="Your companies" subtitle="Choose where to work today.">
      <div className="cards" role="listbox" aria-label="Companies" tabIndex={0} ref={listRef} onKeyDown={onKeyDown}>
        {companies.map((c, i) => (
          <div
            key={c.id}
            role="option"
            aria-selected={i === active}
            className="card"
            onClick={() => open(c.id)}
          >
            <div className="card-title">{c.name}</div>
            <div className="muted small">
              Code {c.code}
              {c.gstin ? ` · GSTIN ${c.gstin}` : ''}
            </div>
            <div className="card-foot">
              <span>{plural(c.yearCount ?? 0, 'financial year')}</span>
              {c.latestYearStatus && <span className={`status ${c.latestYearStatus}`}>{c.latestYearStatus === 'open' ? 'Open' : c.latestYearStatus === 'closed' ? 'Closed' : 'Locked'}</span>}
            </div>
          </div>
        ))}
        {canCreate && (
          <button className="card card-new" onClick={() => setCreating(true)}>
            <span className="plus">+</span>
            <span>
              Create company <kbd>N</kbd>
            </span>
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {companies.length === 0 && !canCreate && <p>No companies are available to you. Ask the administrator.</p>}
      <p className="hint">
        <kbd>←</kbd> <kbd>→</kbd> choose · <kbd>Enter</kbd> open{canCreate && (<> · <kbd>N</kbd> new company</>)} · <kbd>F1</kbd> help
      </p>
    </PageFrame>
  );
}
