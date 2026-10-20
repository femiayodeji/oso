import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  // One row that scrolls sideways instead of wrapping, so its height never grows. It runs edge
  // to edge, so the parent should not pad it horizontally.
  scroll?: boolean;
}

// A scrolling chip's label truncates past this width.
const SCROLL_CHIP_MAX_WIDTH = 200;

// Plain text chips. Selection is shown with surface + weight, never with accent.
export function Chips<T extends string | number>({ options, value, onChange, label, scroll }: Props<T>) {
  const { spacing } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<T, number>());

  // Keep the selected chip in view when the selection changes.
  useEffect(() => {
    const x = value == null ? undefined : offsets.current.get(value);
    if (scroll && x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - spacing.xl), animated: true });
  }, [scroll, value, spacing.xl]);

  const chips = options.map((option) => (
    <Chip
      key={String(option.value)}
      label={option.label}
      selected={option.value === value}
      onPress={() => onChange(option.value)}
      maxWidth={scroll ? SCROLL_CHIP_MAX_WIDTH : '100%'}
      onLayout={scroll ? (x) => offsets.current.set(option.value, x) : undefined}
    />
  ));

  if (scroll) {
    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.scroll}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
      >
        {chips}
      </ScrollView>
    );
  }

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { gap: spacing.sm }]}>
      {chips}
    </View>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  maxWidth: number | '100%';
  onLayout?: (x: number) => void;
}

function Chip({ label, selected, onPress, maxWidth, onLayout }: ChipProps) {
  const { colors, radius, spacing } = useTheme();
  const squish = usePressScale();
  return (
    <Animated.View
      style={[{ maxWidth }, squish.style]}
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.x) : undefined}
    >
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
  // Without this a horizontal ScrollView can stretch to fill the column it sits in.
  scroll: { flexGrow: 0 },
  chip: { minHeight: TOUCH_TARGET, justifyContent: 'center', borderWidth: 1 },
});
