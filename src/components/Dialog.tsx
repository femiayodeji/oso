import { useCallback, useState, type ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { PopIn } from './motion/PopIn';

export interface ConfirmOptions {
  title: string;
  message: string;
  action: string; // the confirm label, explicit about what happens ("Delete", "Regenerate")
  onConfirm: () => void;
}

interface DialogProps extends ConfirmOptions {
  visible: boolean;
  onCancel: () => void;
}

// Themed confirmation in place of the native Alert. Back button and scrim tap cancel.
export function Dialog({ visible, title, message, action, onConfirm, onCancel }: DialogProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onCancel}>
      <View style={[styles.root, { padding: spacing.xl }]}>
        <Pressable
          accessibilityLabel="Cancel"
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        />
        <PopIn style={styles.card}>
          <View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg }}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="heading" accessibilityRole="header">
                {title}
              </AppText>
              <AppText color="textMuted">{message}</AppText>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Button label={action} onPress={onConfirm} />
              <Button label="Cancel" variant="quiet" onPress={onCancel} />
            </View>
          </View>
        </PopIn>
      </View>
    </Modal>
  );
}

// const [dialog, confirm] = useConfirm(); render {dialog}, then call confirm({...}).
export function useConfirm(): [ReactElement | null, (opts: ConfirmOptions) => void] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const confirm = useCallback((next: ConfirmOptions) => setOpts(next), []);
  const dialog = opts ? (
    <Dialog
      visible
      {...opts}
      onCancel={() => setOpts(null)}
      onConfirm={() => {
        setOpts(null);
        opts.onConfirm();
      }}
    />
  ) : null;
  return [dialog, confirm];
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center' },
});
