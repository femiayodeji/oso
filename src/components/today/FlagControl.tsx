import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button } from '../Button';
import { TextField } from '../TextField';

interface Props {
  onRewrite: (note: string) => void;
  onCancel: () => void;
}

// Optional one-line note for the model, then rewrite the card in place.
export function FlagControl({ onRewrite, onCancel }: Props) {
  const { spacing } = useTheme();
  const [note, setNote] = useState('');
  return (
    <View style={{ gap: spacing.sm }}>
      <TextField
        value={note}
        onChangeText={setNote}
        placeholder="What is wrong? (optional)"
        accessibilityLabel="Note for the rewrite"
        maxLength={200}
        returnKeyType="done"
        onSubmitEditing={() => onRewrite(note.trim())}
      />
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Button label="Rewrite card" variant="secondary" onPress={() => onRewrite(note.trim())} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
