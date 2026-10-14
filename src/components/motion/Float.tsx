import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { useReduceMotion } from './useReduceMotion';

// A slow idle bob, for the mascot in empty states. 'wiggle' tilts side to side instead.
export function Float({ children, kind = 'bob' }: { children: ReactNode; kind?: 'bob' | 'wiggle' }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    const half = (toValue: number) =>
      Animated.timing(t, { toValue, duration: kind === 'bob' ? 1400 : 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    loop.start();
    return () => {
      loop.stop();
      t.setValue(0);
    };
  }, [reduce, kind, t]);

  const transform =
    kind === 'bob'
      ? [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }]
      : [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] }) }];

  return <Animated.View style={{ transform }}>{children}</Animated.View>;
}
