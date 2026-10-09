import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { AppText, ErrorText } from './AppText';

interface Props {
  children: ReactNode;
  // Tab screens draw their own header (top inset); stack screens use the native header (bottom inset).
  edges?: Edge[];
  scroll?: boolean;
  padded?: boolean;
  keyboard?: boolean;
  // Native header height, needed so the keyboard offset is right on stack screens.
  keyboardOffset?: number;
}

export function Screen({ children, edges = ['top'], scroll, padded = true, keyboard, keyboardOffset = 0 }: Props) {
  const { colors, spacing } = useTheme();
  const pad = padded ? { padding: spacing.xl } : null;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[pad, { gap: spacing.lg, paddingBottom: spacing.xxxl }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, pad]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.fill}
          // Android is edge-to-edge, so the window is not resized for the keyboard. 'padding' only
          // adds the part of this view the keyboard still overlaps, so it is zero if the OS resized.
          behavior="padding"
          keyboardVerticalOffset={keyboardOffset}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

// Shared quiet states for async screens.
export function LoadingLine({ text = 'Loading…' }: { text?: string }) {
  return (
    <View style={styles.center}>
      <AppText variant="caption">{text}</AppText>
    </View>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <ErrorText center>{text}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
