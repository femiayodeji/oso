import { useColorScheme } from 'react-native';

import { useSettings } from '../settings/SettingsContext';
import { fonts, palette, radius, spacing, type ColorTokens, type Scheme } from './tokens';

export * from './tokens';

export interface Theme {
  colors: ColorTokens;
  scheme: Scheme;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radius: typeof radius;
}

// Follows the system scheme unless Settings overrides it.
export function useTheme(): Theme {
  const system = useColorScheme();
  const { settings } = useSettings();
  const override = settings.colorScheme;
  const scheme: Scheme = override === 'system' ? (system === 'dark' ? 'dark' : 'light') : override;
  return { colors: palette[scheme], scheme, fonts, spacing, radius };
}
