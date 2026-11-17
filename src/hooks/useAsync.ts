import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/** Runs `fn` on mount (and on reload). Ignores results from superseded or unmounted runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: ReadonlyArray<unknown> = []): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(() => {
    const id = ++run.current;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => { if (id === run.current) { setDataState(d); setLoading(false); } },
      (e: unknown) => { if (id === run.current) { setError(e instanceof Error ? e.message : 'Unknown error'); setLoading(false); } },
    );
  }, []);

  useEffect(() => {
    load();
    return () => { run.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState((p) => updater(p)), []);
  return { data, loading, error, reload: load, setData };
}
