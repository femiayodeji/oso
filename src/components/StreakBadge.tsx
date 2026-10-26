import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '../theme';
import { AppText } from './AppText';
import { useReduceMotion } from './motion/useReduceMotion';

// Flame plus number on a small accent tile, as on the brand sheet; the full panda is never shown for the streak.
// When the count goes up, the flame jumps and wiggles and the number pops.
// Until a session is done today the tile is greyed out, so the day's goal shows at a glance.
export function StreakBadge({ count, active }: { count: number; active: boolean }) {
  const { colors, radius, spacing } = useTheme();
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
  const fg = active ? 'onAccent' : 'textMuted';
  const number = { transform: [{ scale: jump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] };

  return (
    <View
      accessible
      accessibilityLabel={`Streak: ${count} ${count === 1 ? 'day' : 'days'}${active ? '' : ', not done today'}`}
      style={styles.hit}
    >
      <View
        style={[
          styles.badge,
          { gap: spacing.xs, backgroundColor: active ? colors.accent : colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
        ]}
      >
        <Animated.View style={flame}>
          <Ionicons name="flame" size={18} color={colors[fg]} />
        </Animated.View>
        <Animated.View style={number}>
          <AppText variant="body" color={fg} style={{ fontFamily: fonts.bold }}>
            {count}
          </AppText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
});
