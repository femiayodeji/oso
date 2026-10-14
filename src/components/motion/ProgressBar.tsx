import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useReduceMotion } from './useReduceMotion';

// A rounded bar that springs to `value` (0 to 1).
export function ProgressBar({ value, height = 12 }: { value: number; height?: number }) {
  const { colors, radius } = useTheme();
  const reduce = useReduceMotion();
  const clamped = Math.min(1, Math.max(0, value));
  const fill = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (reduce) {
      fill.setValue(clamped);
      return;
    }
    const anim = Animated.spring(fill, { toValue: clamped, friction: 7, tension: 60, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [clamped, reduce, fill]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: radius.pill, backgroundColor: colors.surface }]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius.pill, backgroundColor: colors.accent, transformOrigin: 'left', transform: [{ scaleX: fill }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
});
