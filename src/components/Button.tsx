import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { playSound } from '../sound';
import { TOUCH_TARGET, useTheme } from '../theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface ButtonProps {
  label: string;
  onPress: () => void;
  // primary = accent fill, secondary = surface + border, quiet = text only
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  silent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, silent, style }: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const primary = variant === 'primary';
  const press = () => {
    if (primary && !silent) playSound('click');
    onPress();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: radius.md, paddingHorizontal: spacing.xl },
        primary && { backgroundColor: colors.accent },
        variant === 'secondary' && {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        variant === 'quiet' && { paddingHorizontal: spacing.sm },
        (pressed || disabled) && styles.dim,
        style,
      ]}
    >
      <AppText variant="bodyStrong" color={primary ? 'onAccent' : variant === 'quiet' ? 'textMuted' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string; // accessibility label, required for icon-only buttons
  onPress: () => void;
  size?: number;
  disabled?: boolean;
}

export function IconButton({ icon, label, onPress, size = 22, disabled }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, (pressed || disabled) && styles.dim]}
    >
      <Ionicons name={icon} size={size} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  icon: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
});
