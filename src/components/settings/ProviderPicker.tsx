import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { PROVIDERS } from '../../llm/providers';
import { TOUCH_TARGET, useTheme } from '../../theme';
import type { Provider } from '../../types';
import { AppText } from '../AppText';
import { PopIn } from '../motion/PopIn';
import { useReduceMotion } from '../motion/useReduceMotion';

const ALL = Object.keys(PROVIDERS) as Provider[];

interface Props {
  value: Provider;
  savedProviders: Provider[];
  onChange: (provider: Provider) => void;
}

// A dropdown that opens in place; each provider says whether a key is saved for it.
export function ProviderPicker({ value, savedProviders, onChange }: Props) {
  const { colors, radius, spacing } = useTheme();
  const reduce = useReduceMotion();
  const [open, setOpen] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = open ? 1 : 0;
    if (reduce) turn.setValue(toValue);
    else Animated.spring(turn, { toValue, friction: 6, useNativeDriver: true }).start();
  }, [open, reduce, turn]);

  const pick = (provider: Provider) => {
    setOpen(false);
    if (provider !== value) onChange(provider);
  };

  const keyNote = (provider: Provider) => (savedProviders.includes(provider) ? 'Key saved' : 'No key');
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption">Provider</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Provider, ${PROVIDERS[value].label}, ${keyNote(value)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.sm,
            paddingHorizontal: spacing.lg,
            gap: spacing.sm,
          },
        ]}
      >
        <AppText style={styles.fill} numberOfLines={1}>
          {PROVIDERS[value].label}
        </AppText>
        <AppText variant="caption">{keyNote(value)}</AppText>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {open ? (
        <View
          accessibilityRole="radiogroup"
          style={[styles.list, { borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.lg }]}
        >
          {ALL.map((provider, i) => {
            const selected = provider === value;
            const saved = savedProviders.includes(provider);
            return (
              <PopIn key={provider} kind="rise" delay={i * 40}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${PROVIDERS[provider].label}, ${keyNote(provider)}`}
                  onPress={() => pick(provider)}
                  style={[
                    styles.row,
                    { gap: spacing.sm, borderBottomColor: colors.border },
                    i === ALL.length - 1 && styles.last,
                  ]}
                >
                  <AppText variant={selected ? 'bodyStrong' : 'body'} style={styles.fill}>
                    {PROVIDERS[provider].label}
                  </AppText>
                  {saved ? <Ionicons name="key-outline" size={16} color={colors.textMuted} /> : null}
                  <AppText variant="caption">{keyNote(provider)}</AppText>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.text} /> : null}
                </Pressable>
              </PopIn>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  field: { minHeight: 48, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  list: { borderWidth: 1 },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: { borderBottomWidth: 0 },
});
