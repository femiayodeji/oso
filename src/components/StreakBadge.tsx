import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '../theme';
import { AppText } from './AppText';
import { useReduceMotion } from './motion/useReduceMotion';

// Flame plus number only; the full panda is never shown for the streak.
// When the count goes up, the flame jumps and wiggles and the number pops.
export function StreakBadge({ count }: { count: number }) {
  const { colors, spacing } = useTheme();
  const reduce = useReduceMotion();
  const previous = useRef(count);
  const jump = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const grew = count > previous.current;
    previous.current = count;
    if (!grew || reduce) return;
    jump.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(300),
      Animated.timing(jump, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(jump, { toValue: 0, friction: 3, tension: 120, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [count, reduce, jump]);

  const flame = {
    transform: [
      { translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { scale: jump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
      { rotate: jump.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-12deg', '10deg'] }) },
    ],
  };
  const number = { transform: [{ scale: jump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] };

  return (
    <View
      accessible
      accessibilityLabel={`Streak: ${count} ${count === 1 ? 'day' : 'days'}`}
      style={[styles.badge, { gap: spacing.xs }]}
    >
      <Animated.View style={flame}>
        <Ionicons name="flame" size={18} color={colors.accent} />
      </Animated.View>
      <Animated.View style={number}>
        <AppText variant="body" color="accent" style={{ fontFamily: fonts.bold }}>
          {count}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
