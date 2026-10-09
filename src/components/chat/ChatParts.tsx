import type { Ref } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { typeScale, useTheme } from '../../theme';
import type { ChatMessage } from '../../types';
import { AppText } from '../AppText';
import { IconButton } from '../Button';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const { colors, radius, spacing } = useTheme();
  const mine = message.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        { borderRadius: radius.lg, padding: spacing.md, alignSelf: mine ? 'flex-end' : 'flex-start' },
        mine ? { backgroundColor: colors.surface } : { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <AppText variant="body" selectable>
        {message.content}
      </AppText>
    </View>
  );
}

interface ComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  inputRef: Ref<TextInput>;
}

export function Composer({ value, onChangeText, onSend, disabled, inputRef }: ComposerProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={[styles.composer, { gap: spacing.sm, padding: spacing.md, borderTopColor: colors.border }]}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask about the book or set a plan"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Message"
        multiline
        style={[
          typeScale.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
          },
        ]}
      />
      <IconButton icon="arrow-up-circle" label="Send message" size={30} disabled={disabled} onPress={onSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingTop: 10, paddingBottom: 10 },
});
