import { Text, type TextProps } from 'react-native';

import { typeScale, useTheme, type ColorTokens, type TextVariant } from '../theme';

type TextColor = Extract<keyof ColorTokens, 'text' | 'textMuted' | 'danger' | 'accent' | 'onAccent'>;

interface Props extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
  center?: boolean;
}

export function AppText({ variant = 'body', color, center, style, ...rest }: Props) {
  const { colors } = useTheme();
  const fallback: TextColor = variant === 'caption' || variant === 'label' ? 'textMuted' : 'text';
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        { color: colors[color ?? fallback] },
        variant === 'label' && { textTransform: 'uppercase' },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

export function ErrorText({ children, center }: { children: string | null | undefined; center?: boolean }) {
  if (!children) return null;
  return (
    <AppText variant="caption" color="danger" center={center} accessibilityRole="alert">
      {children}
    </AppText>
  );
}
