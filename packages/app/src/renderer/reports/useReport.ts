import { useRef, useState } from 'react';

export function useReport<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function run(fetcher: () => Promise<T>): Promise<void> {
    const mine = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mine === latest.current) setData(result);
    } catch (e) {
      if (mine === latest.current) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }

  /** Report a problem found before calling the server (a missing filter). Cancels any run in flight. */
  function fail(message: string): void {
    latest.current++;
    setData(null);
    setLoading(false);
    setError(message);
  }

  return { data, loading, error, run, fail };
}
