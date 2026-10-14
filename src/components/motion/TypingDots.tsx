import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useReduceMotion } from './useReduceMotion';

// Three dots hopping in turn while the model replies.
export function TypingDots() {
  const { colors, spacing } = useTheme();
  const reduce = useReduceMotion();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduce) return;
    const hop = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]);
    const loop = Animated.loop(Animated.sequence([Animated.stagger(140, dots.map(hop)), Animated.delay(250)]));
    loop.start();
    return () => loop.stop();
  }, [reduce, dots]);

  return (
    <View accessibilityLabel="Thinking" style={[styles.row, { gap: spacing.xs }]}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: colors.textMuted,
              transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
