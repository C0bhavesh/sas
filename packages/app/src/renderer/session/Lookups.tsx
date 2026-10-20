import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VoucherKind } from '@sas/shared';
import { listBooks, listGroups, listLedgers } from '../api/endpoints';
import type { BookLite, GroupLite, LedgerLite } from '../api/types';
import type { LookupItem } from '../ui/Lookup';
import { useApi } from './deps';
import { useSession } from './Session';

export interface LookupsValue {
  ledgers: LedgerLite[];
  books: BookLite[];
  groups: GroupLite[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  ledgerItems: LookupItem[];
  booksFor(kind: VoucherKind): BookLite[];
  bookItems(kind: VoucherKind): LookupItem[];
}

export const LookupsContext = createContext<LookupsValue | null>(null);

export function useLookups(): LookupsValue {
  const v = useContext(LookupsContext);
  if (!v) throw new Error('LookupsProvider is missing');
  return v;
}

export function LookupsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const companyId = useSession().company?.id ?? null;
  const [ledgers, setLedgers] = useState<LedgerLite[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setLedgers([]);
      setBooks([]);
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [l, b, g] = await Promise.all([listLedgers(api, companyId), listBooks(api, companyId), listGroups(api, companyId)]);
      setLedgers(l);
      setBooks(b);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<LookupsValue>(() => {
    const booksFor = (kind: VoucherKind) =>
      books.filter((b) => (kind === 'journal' ? b.type === 'journal' : b.type === 'cash' || b.type === 'bank'));
    return {
      ledgers,
      books,
      groups,
      loading,
      error,
      reload,
      ledgerItems: ledgers
        .filter((l) => l.status === 'active')
        .map((l) => ({ id: l.id, label: l.name, sub: [l.groupName, l.city].filter(Boolean).join(' · ') })),
      booksFor,
      bookItems: (kind) => booksFor(kind).map((b) => ({ id: b.id, label: b.name, sub: b.code })),
    };
  }, [ledgers, books, groups, loading, error, reload]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}
