import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Actor, ModuleName, RightAction, Rights } from '@sas/shared';
import { listYears, me as fetchMe } from '../api/endpoints';
import type { CompanyLite, MeResponse, YearLite } from '../api/types';
import { useDeps } from './deps';

/** Which page the person is on before the working screens: companies, then years, then Home. */
export type Stage = 'companies' | 'years' | 'home';

export interface SessionValue {
  actor: Actor;
  rights: Record<ModuleName, Rights>;
  companies: CompanyLite[];
  company: CompanyLite | null;
  year: YearLite | null;
  years: YearLite[];
  stage: Stage;
  /** Open a company and go to its years page. */
  enterCompany(id: string): Promise<void>;
  /** Choose a year and go to Home. */
  openYear(id: string): void;
  backToCompanies(): void;
  backToYears(): void;
  /** Switch company from inside the app, picking its newest open year. */
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
  const [yearChosen, setYearChosen] = useState(false);

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
      setYearChosen(y !== null);
      await bridge.setConfig({ lastCompanyId: c.id, ...(y ? { lastYearId: y.id } : {}) });
    },
    [api, bridge],
  );

  const value = useMemo<SessionValue>(
    () => ({
      actor: me.actor,
      rights: me.rights,
      companies,
      company,
      year,
      years,
      stage: !company ? 'companies' : !yearChosen ? 'years' : 'home',
      async enterCompany(id) {
        const c = companies.find((x) => x.id === id);
        if (!c) return;
        setCompany(c);
        setYear(null);
        setYearChosen(false);
        setYears(await listYears(api, c.id));
        await bridge.setConfig({ lastCompanyId: c.id });
      },
      openYear(id) {
        const y = years.find((x) => x.id === id);
        if (!y) return;
        setYear(y);
        setYearChosen(true);
        void bridge.setConfig({ lastYearId: y.id });
      },
      backToCompanies() {
        setCompany(null);
        setYear(null);
        setYearChosen(false);
      },
      backToYears() {
        setYearChosen(false);
      },
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
      },
      async reloadYears() {
        if (company) await loadCompany(company, year?.id);
      },
      can: (module, action) => me.actor.isAdmin || me.rights[module]?.[action] === true,
      logout: onLogout,
      testMode,
    }),
    [me, companies, company, year, years, yearChosen, api, bridge, loadCompany, onLogout, testMode],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
