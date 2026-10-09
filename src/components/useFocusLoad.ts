import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong.';
}

// Loads screen data on focus, and again when the app returns to the foreground while the
// screen is focused (the day may have changed). Exposes loading / error / reload.
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
      // 'change' only fires on transitions, so this never doubles the load above.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reload();
      });
      return () => sub.remove();
    }, [reload]),
  );

  return { data, error, loading, reload };
}
