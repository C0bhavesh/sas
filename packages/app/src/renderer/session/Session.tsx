import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Actor, ModuleName, RightAction, Rights } from '@sas/shared';
import { listYears, me as fetchMe } from '../api/endpoints';
import type { CompanyLite, MeResponse, YearLite } from '../api/types';
import { useDeps } from './deps';

export interface SessionValue {
  actor: Actor;
  rights: Record<ModuleName, Rights>;
  companies: CompanyLite[];
  company: CompanyLite | null;
  year: YearLite | null;
  years: YearLite[];
  selectCompany(id: string): Promise<void>;
  selectYear(id: string): void;
  refreshCompanies(): Promise<void>;
  reloadYears(): Promise<void>;
  can(module: ModuleName, action: RightAction): boolean;
  logout(): void;
  /** The server has sign-in switched off (testing only). */
  testMode: boolean;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionProvider is missing');
  return s;
}

/** The remembered year if it still exists, otherwise the newest open year, otherwise the newest year. */
export function pickYear(years: YearLite[], preferredId?: string): YearLite | null {
  if (years.length === 0) return null;
  const preferred = years.find((y) => y.id === preferredId);
  if (preferred) return preferred;
  const byStart = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return [...byStart].reverse().find((y) => y.status === 'open') ?? byStart[byStart.length - 1]!;
}

export function SessionProvider({ me, onLogout, testMode = false, children }: { me: MeResponse; onLogout: () => void; testMode?: boolean; children: ReactNode }) {
  const { api, bridge } = useDeps();
  const [companies, setCompanies] = useState<CompanyLite[]>(me.companies);
  const [company, setCompany] = useState<CompanyLite | null>(null);
  const [years, setYears] = useState<YearLite[]>([]);
  const [year, setYear] = useState<YearLite | null>(null);
  const [ready, setReady] = useState(false);

  const loadCompany = useCallback(
    async (c: CompanyLite | null, preferredYearId?: string) => {
      setCompany(c);
      if (!c) {
        setYears([]);
        setYear(null);
        return;
      }
      const ys = await listYears(api, c.id);
      const y = pickYear(ys, preferredYearId);
      setYears(ys);
      setYear(y);
      await bridge.setConfig({ lastCompanyId: c.id, ...(y ? { lastYearId: y.id } : {}) });
    },
    [api, bridge],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cfg = await bridge.getConfig();
      const c = me.companies.find((x) => x.id === cfg.lastCompanyId) ?? me.companies[0] ?? null;
      await loadCompany(c, cfg.lastYearId);
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
    // Only on first mount: later changes go through selectCompany / selectYear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      actor: me.actor,
      rights: me.rights,
      companies,
      company,
      year,
      years,
      async selectCompany(id) {
        const c = companies.find((x) => x.id === id);
        if (c) await loadCompany(c);
      },
      selectYear(id) {
        const y = years.find((x) => x.id === id);
        if (!y) return;
        setYear(y);
        void bridge.setConfig({ lastYearId: y.id });
      },
      async refreshCompanies() {
        const fresh = await fetchMe(api);
        setCompanies(fresh.companies);
        if (!company && fresh.companies[0]) await loadCompany(fresh.companies[0]);
      },
      async reloadYears() {
        if (company) await loadCompany(company, year?.id);
      },
      can: (module, action) => me.actor.isAdmin || me.rights[module]?.[action] === true,
      logout: onLogout,
      testMode,
    }),
    [me, companies, company, year, years, api, bridge, loadCompany, onLogout, testMode],
  );

  if (!ready) return <p style={{ padding: 16 }}>Loading…</p>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
