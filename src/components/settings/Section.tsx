import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}
