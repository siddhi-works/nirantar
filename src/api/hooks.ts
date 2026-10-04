import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { api } from './index';

export interface Query<T> {
  data: T | undefined;
  loading: boolean; // first load only — refreshes keep showing the previous data
  error: string | null;
  refetch: () => void;
}

/** Fetch on mount / dependency change, and refetch whenever the backend signals a change. */
export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList): Query<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const seq = useRef(0);

  const run = useCallback((first: boolean) => {
    const my = ++seq.current;
    if (first) setLoading(true);
    fetchRef.current().then(
      d => { if (my === seq.current) { setData(d); setError(null); setLoading(false); } },
      e => { if (my === seq.current) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(true); }, deps);
  useEffect(() => api.subscribe(() => run(false)), [run]);

  return { data, loading, error, refetch: () => run(false) };
}
