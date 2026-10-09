import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong.';
}

// Loads screen data on focus and exposes loading / error / reload.
export function useFocusLoad<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const run = ++seq.current;
    try {
      const next = await loaderRef.current();
      if (run !== seq.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (run === seq.current) setError(errorMessage(e));
    } finally {
      if (run === seq.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, reload };
}
