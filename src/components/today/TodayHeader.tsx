import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../AppText';
import { IconButton } from '../Button';
import { pandaIcon } from '../Mascot';
import { StreakBadge } from '../StreakBadge';

interface Props {
  streak: number;
  onChat?: () => void;
}

export function TodayHeader({ streak, onChat }: Props) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: spacing.xl, paddingTop: spacing.sm }]}>
      <View style={[styles.brand, { gap: spacing.sm }]}>
        <Image source={pandaIcon} style={styles.icon} accessibilityIgnoresInvertColors />
        <AppText variant="heading" accessibilityRole="header">
          Oso
        </AppText>
      </View>
      <View style={[styles.brand, { gap: spacing.sm }]}>
        {onChat ? <IconButton icon="chatbubble-outline" label="Open chat" onPress={onChat} /> : null}
        <StreakBadge count={streak} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, resizeMode: 'contain' },
});
