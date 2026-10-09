import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../db/settings';
import { setSoundsEnabled } from '../sound';
import type { AppSettings } from '../types';

interface SettingsValue {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<void>;
  ready: boolean;
}

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  update: async () => {},
  ready: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((loaded) => {
        if (alive) setSettings(loaded);
      })
      .catch(() => {
        // Defaults stay in place; the app is still usable.
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setSoundsEnabled(settings.soundsEnabled);
  }, [settings.soundsEnabled]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    const saved = await updateSettings(patch);
    setSettings(saved);
  }, []);

  const value = useMemo(() => ({ settings, update, ready }), [settings, update, ready]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}
