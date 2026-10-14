import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { celebration, useTheme } from '../../theme';
import { useReduceMotion } from './useReduceMotion';

const PIECES = 36;
const DURATION = 2200;

interface Piece {
  x: number; // horizontal drift, px
  lift: number; // how high it is thrown, px
  spin: number; // turns
  size: number;
  color: string;
  delay: number;
}

function makePieces(colors: string[], width: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    x: (Math.random() - 0.5) * width,
    lift: 160 + Math.random() * 220,
    spin: (Math.random() - 0.5) * 6,
    size: 7 + Math.random() * 6,
    color: colors[i % colors.length],
    delay: Math.random() * 150,
  }));
}

// One burst from the middle of the screen. Touches pass through it.
export function Confetti() {
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => makePieces(celebration[scheme], width), [scheme, width]);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    const anim = Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reduce, t]);

  if (reduce) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const start = p.delay / DURATION;
        // Thrown up, then falls past where it started, the way paper does.
        const translateY = t.interpolate({
          inputRange: [0, start, start + 0.25, 1],
          outputRange: [0, 0, -p.lift, height * 0.6],
        });
        const translateX = t.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, p.x] });
        const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
        const opacity = t.interpolate({ inputRange: [0, start, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                top: height * 0.4,
                left: width / 2,
                width: p.size,
                height: p.size * 0.6,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', borderRadius: 2 },
});
