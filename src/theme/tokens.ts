// The only file in the app where raw colour values appear.

export interface ColorTokens {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentShade: string; // the pressable lip under primary buttons
  onAccent: string;
  danger: string;
}

export type Scheme = 'light' | 'dark';

export const palette: Record<Scheme, ColorTokens> = {
  light: {
    background: '#F7F6F2',
    surface: '#EFEDE6',
    text: '#1A1F1C',
    textMuted: '#6B726D',
    border: '#E2DFD6',
    accent: '#1F6B4A',
    accentShade: '#14482F',
    onAccent: '#F7F6F2',
    danger: '#B3412F',
  },
  dark: {
    background: '#121614',
    surface: '#1B201D',
    text: '#E8E6E1',
    textMuted: '#9AA29C',
    border: '#2A302C',
    accent: '#4FB387',
    accentShade: '#2F7A57',
    onAccent: '#0E1411',
    danger: '#E07A67',
  },
};

// Confetti only: the celebration on finishing a session or a topic.
export const celebration: Record<Scheme, string[]> = {
  light: ['#1F6B4A', '#E2A93B', '#D9644A', '#4F8FD1', '#9C6ADE'],
  dark: ['#4FB387', '#F2C25B', '#E8846C', '#74A9E3', '#B48AEB'],
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 12, md: 14, lg: 16, pill: 999 } as const;

// Custom fonts on React Native need one family name per weight.
export const fonts = {
  regular: 'Nunito-Regular',
  semiBold: 'Nunito-SemiBold',
  bold: 'Nunito-Bold',
} as const;

export const typeScale = {
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28 },
  card: { fontFamily: fonts.regular, fontSize: 21, lineHeight: 32 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8 },
} as const;

export type TextVariant = keyof typeof typeScale;

export const TOUCH_TARGET = 44;
