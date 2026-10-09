import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme } from '../theme';
import { AppText } from './AppText';

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
  const { colors, radius, spacing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { gap: spacing.sm }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
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
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { minHeight: TOUCH_TARGET, justifyContent: 'center', borderWidth: 1, maxWidth: '100%' },
});
