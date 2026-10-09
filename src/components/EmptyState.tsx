import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { AppText, ErrorText } from './AppText';
import { Button } from './Button';
import { Mascot, type MascotState } from './Mascot';

interface Props {
  mascot: MascotState;
  text: string;
  buttonLabel?: string;
  onPress?: () => void;
  // The quiet "day done" checkmark, one of the few places accent is allowed.
  done?: boolean;
  error?: string | null;
  size?: number;
}

// One mascot, one line of text, one button.
export function EmptyState({ mascot, text, buttonLabel, onPress, done, error, size = 140 }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.wrap, { padding: spacing.xl, gap: spacing.lg }]}>
      <Mascot state={mascot} size={size} />
      <View style={[styles.line, { gap: spacing.sm }]}>
        {done ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
        <AppText variant="bodyStrong" center style={styles.text}>
          {text}
        </AppText>
      </View>
      <ErrorText center>{error}</ErrorText>
      {buttonLabel && onPress ? <Button label={buttonLabel} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
});
