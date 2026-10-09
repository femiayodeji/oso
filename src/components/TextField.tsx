import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { typeScale, useTheme } from '../theme';
import { AppText, ErrorText } from './AppText';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  // Accent border, used only to point at the API key field on first run.
  highlight?: boolean;
  ref?: Ref<TextInput>;
}

export function TextField({ label, error, highlight, style, multiline, ref, ...rest }: Props) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText variant="caption">{label}</AppText> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        {...rest}
        style={[
          typeScale.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: highlight ? colors.accent : colors.border,
            borderRadius: radius.sm,
            paddingHorizontal: spacing.lg,
          },
          multiline && styles.multiline,
          style,
        ]}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, paddingVertical: 10 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
});
