import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { playSound } from '../../sound';
import { TOUCH_TARGET, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { PopIn } from '../motion/PopIn';
import { useReduceMotion } from '../motion/useReduceMotion';

interface Props {
  options: string[];
  answerIdx: number;
  explanation: string | null;
  onAnswered: (correct: boolean) => void;
}

// One tap answers. Right: the option turns green and pops. Wrong: it shakes red and the
// right one is shown. Either way the explanation follows.
export function QuizOptions({ options, answerIdx, explanation, onAnswered }: Props) {
  const { colors, radius, spacing } = useTheme();
  const reduce = useReduceMotion();
  const [chosen, setChosen] = useState<number | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const answered = chosen !== null;

  const choose = (idx: number) => {
    if (answered) return;
    setChosen(idx);
    const correct = idx === answerIdx;
    playSound(correct ? 'click' : 'tap');
    onAnswered(correct);
    if (reduce) return;
    if (correct) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }).start();
    } else {
      shake.setValue(0);
      Animated.sequence(
        [10, -10, 8, -8, 4, 0].map((toValue) =>
          Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }),
        ),
      ).start();
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((option, idx) => {
        const isAnswer = idx === answerIdx;
        const isChosen = idx === chosen;
        const right = answered && isAnswer;
        const wrong = answered && isChosen && !isAnswer;
        const tone = right ? colors.accent : wrong ? colors.danger : colors.border;
        const motion = isChosen ? { transform: right ? [{ scale: pop }] : [{ translateX: shake }] } : undefined;
        return (
          <Animated.View key={idx} style={motion}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: answered, selected: isChosen }}
              accessibilityLabel={`${option}${right ? ', correct' : wrong ? ', wrong' : ''}`}
              disabled={answered}
              onPress={() => choose(idx)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: tone,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.lg,
                  gap: spacing.sm,
                  backgroundColor: right || (pressed && !answered) ? colors.surface : 'transparent',
                },
                // The same pressable lip as buttons, flattened once answered.
                !answered && (pressed ? { marginTop: 3, borderBottomWidth: 2 } : { borderBottomWidth: 5 }),
              ]}
            >
              <AppText
                variant={right ? 'bodyStrong' : 'body'}
                color={answered && !right && !wrong ? 'textMuted' : 'text'}
                style={styles.fill}
              >
                {option}
              </AppText>
              {right ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
              {wrong ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
            </Pressable>
          </Animated.View>
        );
      })}
      {answered ? (
        <PopIn kind="rise" delay={200} style={{ gap: spacing.xs, paddingTop: spacing.sm }}>
          <AppText variant="bodyStrong" color={chosen === answerIdx ? 'accent' : 'danger'}>
            {chosen === answerIdx ? 'Nice!' : 'Not quite.'}
          </AppText>
          {explanation ? <AppText variant="body">{explanation}</AppText> : null}
        </PopIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: TOUCH_TARGET + 8, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  fill: { flex: 1 },
});
