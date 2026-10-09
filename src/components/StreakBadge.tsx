import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '../theme';
import { AppText } from './AppText';

// Flame plus number only; the full panda is never shown for the streak.
export function StreakBadge({ count }: { count: number }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Streak: ${count} ${count === 1 ? 'day' : 'days'}`}
      style={[styles.badge, { gap: spacing.xs }]}
    >
      <Ionicons name="flame" size={18} color={colors.accent} />
      <AppText variant="body" color="accent" style={{ fontFamily: fonts.bold }}>
        {count}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
