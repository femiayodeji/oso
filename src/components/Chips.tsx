import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme } from '../theme';
import { AppText } from './AppText';
import { usePressScale } from './motion/usePressScale';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: Option<T>[];
  value?: T | null;
  onChange: (value: T) => void;
  label?: string;
}

// Plain text chips. Selection is shown with surface + weight, never with accent.
export function Chips<T extends string | number>({ options, value, onChange, label }: Props<T>) {
  const { spacing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { gap: spacing.sm }]}>
      {options.map((option) => (
        <Chip
          key={String(option.value)}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const squish = usePressScale();
  return (
    <Animated.View style={[styles.wrap, squish.style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={squish.onPressIn}
        onPressOut={squish.onPressOut}
        style={[
          styles.chip,
          {
            borderRadius: radius.pill,
            paddingHorizontal: spacing.lg,
            borderColor: selected ? colors.text : colors.border,
            backgroundColor: selected ? colors.surface : 'transparent',
          },
        ]}
      >
        <AppText variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'text' : 'textMuted'} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  wrap: { maxWidth: '100%' },
  chip: { minHeight: TOUCH_TARGET, justifyContent: 'center', borderWidth: 1 },
});
