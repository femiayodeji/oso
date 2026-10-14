import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { AppText, ErrorText } from './AppText';
import { Button } from './Button';
import { Chips } from './Chips';
import { Mascot, type MascotState } from './Mascot';
import { Confetti } from './motion/Confetti';
import { Float } from './motion/Float';
import { PopIn } from './motion/PopIn';

interface Props {
  mascot: MascotState;
  text: string;
  buttonLabel?: string;
  onPress?: () => void;
  // An optional quiet second action (text only), e.g. reviewing due cards.
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  // The quiet "day done" checkmark, one of the few places accent is allowed.
  done?: boolean;
  error?: string | null;
  size?: number;
  // Just finished something: confetti and a bigger entrance.
  celebrate?: boolean;
  // Tappable ideas under the button, e.g. topics to learn next.
  suggestions?: string[];
  onSuggest?: (suggestion: string) => void;
}

// One mascot, one line of text, one button.
export function EmptyState({
  mascot,
  text,
  buttonLabel,
  onPress,
  secondaryLabel,
  onSecondaryPress,
  done,
  error,
  size = 140,
  celebrate,
  suggestions,
  onSuggest,
}: Props) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.wrap, { padding: spacing.xl, gap: spacing.lg }]}>
      <PopIn>
        <Float>
          <Mascot state={mascot} size={size} />
        </Float>
      </PopIn>
      <PopIn kind="rise" delay={120} style={[styles.line, { gap: spacing.sm }]}>
        {done ? (
          <PopIn delay={celebrate ? 450 : 200}>
            <Ionicons name="checkmark-circle" size={celebrate ? 28 : 20} color={colors.accent} />
          </PopIn>
        ) : null}
        <AppText variant="bodyStrong" center style={styles.text}>
          {text}
        </AppText>
      </PopIn>
      <ErrorText center>{error}</ErrorText>
      <PopIn kind="rise" delay={220} style={[styles.actions, { gap: spacing.sm }]}>
        {buttonLabel && onPress ? <Button label={buttonLabel} onPress={onPress} /> : null}
        {secondaryLabel && onSecondaryPress ? (
          <Button label={secondaryLabel} variant="quiet" onPress={onSecondaryPress} />
        ) : null}
      </PopIn>
      {suggestions && onSuggest ? (
        <PopIn kind="rise" delay={320} style={[styles.actions, { gap: spacing.sm }]}>
          <AppText variant="caption">Or try</AppText>
          <Chips label="Suggestions" options={suggestions.map((s) => ({ value: s, label: s }))} onChange={onSuggest} />
        </PopIn>
      ) : null}
      {celebrate ? <Confetti /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
  actions: { alignItems: 'center' },
});
