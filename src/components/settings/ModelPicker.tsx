import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeLlmError } from '../../llm/errors';
import { listModels, type ModelOption } from '../../llm/models';
import { TOUCH_TARGET, useTheme } from '../../theme';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { TextField } from '../TextField';

interface Props {
  // Stored model; empty means "use the provider default".
  value: string;
  defaultModel: string;
  onChange: (model: string) => void;
}

type Load = { kind: 'loading' } | { kind: 'ready'; models: ModelOption[] } | { kind: 'failed'; message: string };

interface Row {
  key: string;
  model: string; // what gets stored
  title: string;
  note: string | null;
}

function buildRows(models: ModelOption[], defaultModel: string, query: string): Row[] {
  const q = query.trim().toLowerCase();
  const rows: Row[] = models
    .filter((m) => m.id !== defaultModel && m.id.toLowerCase().includes(q))
    .map((m) => ({ key: m.id, model: m.id, title: m.id, note: m.note }));
  if (!q || defaultModel.toLowerCase().includes(q)) {
    rows.unshift({ key: '', model: '', title: defaultModel, note: 'Default' });
  }
  // Any id can still be typed by hand, for models the provider does not list.
  if (q && q !== defaultModel.toLowerCase() && !models.some((m) => m.id.toLowerCase() === q)) {
    rows.push({ key: `custom:${q}`, model: query.trim(), title: `Use "${query.trim()}"`, note: null });
  }
  return rows;
}

export function ModelPicker({ value, defaultModel, onChange }: Props) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const show = () => {
    setQuery('');
    setLoad({ kind: 'loading' });
    setOpen(true);
    listModels()
      .then((models) => setLoad({ kind: 'ready', models }))
      .catch((e: unknown) => setLoad({ kind: 'failed', message: describeLlmError(e) }));
  };

  const pick = (model: string) => {
    setOpen(false);
    if (model !== value) onChange(model);
  };

  const rows = buildRows(load.kind === 'ready' ? load.models : [], defaultModel, query);

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption">Model</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Model, ${value || defaultModel}`}
        onPress={show}
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
          {value || defaultModel}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {value ? null : <AppText variant="caption">Default for this provider.</AppText>}

      <Modal visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top + spacing.lg,
              paddingHorizontal: spacing.xl,
              gap: spacing.md,
            },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="heading" accessibilityRole="header">
              Model
            </AppText>
            <Button label="Close" variant="quiet" onPress={() => setOpen(false)} />
          </View>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search or type a model id"
            accessibilityLabel="Search models"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {load.kind === 'loading' ? <AppText variant="caption">Loading models…</AppText> : null}
          {load.kind === 'failed' ? <ErrorText>{load.message}</ErrorText> : null}
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            renderItem={({ item }) => {
              const selected = item.model === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => pick(item.model)}
                  style={[styles.row, { borderBottomColor: colors.border, paddingVertical: spacing.md }]}
                >
                  <AppText variant={selected ? 'bodyStrong' : 'body'}>{item.title}</AppText>
                  {item.note ? <AppText variant="caption">{item.note}</AppText> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  field: { minHeight: 48, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { minHeight: TOUCH_TARGET, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
