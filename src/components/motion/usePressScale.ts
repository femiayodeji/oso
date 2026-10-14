import { useRef } from 'react';
import { Animated } from 'react-native';

import { useReduceMotion } from './useReduceMotion';

// A quick squish on press, for chips and icon buttons. Spread the result onto an
// Animated.View wrapping the Pressable, and the handlers onto the Pressable.
export function usePressScale(to = 0.92) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) => {
    if (reduce) return;
    Animated.spring(scale, { toValue, friction: 4, tension: 300, useNativeDriver: true }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => spring(to),
    onPressOut: () => spring(1),
  };
}
