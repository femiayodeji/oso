import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from './useReduceMotion';

interface Props {
  children: ReactNode;
  delay?: number;
  // 'pop' springs up from small; 'rise' slides up while fading in.
  kind?: 'pop' | 'rise';
  style?: StyleProp<ViewStyle>;
}

// Plays once on mount. Remount (change the key) to play it again.
export function PopIn({ children, delay = 0, kind = 'pop', style }: Props) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(progress, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduce, delay, progress]);

  const motion =
    kind === 'pop'
      ? { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }
      : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
  const opacity = progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });

  return <Animated.View style={[{ opacity }, motion, style]}>{children}</Animated.View>;
}
