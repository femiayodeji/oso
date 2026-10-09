import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme } from '../../theme';
import type { Chapter, Task } from '../../types';
import { AppText } from '../AppText';

export function ChapterList({ chapters }: { chapters: Chapter[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="heading" accessibilityRole="header">
        Chapters
      </AppText>
      {chapters.map((chapter) => (
        <View key={chapter.id} style={{ gap: spacing.xs }}>
          <AppText variant="bodyStrong">{chapter.title}</AppText>
          {chapter.summary ? <AppText variant="body">{chapter.summary}</AppText> : null}
          {chapter.genStatus === 'failed' ? (
            <AppText variant="caption" color="danger">
              This chapter could not be prepared.
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

interface TaskPoolProps {
  tasks: Task[];
  onOpen: (task: Task) => void;
}

// Ordered pool. Completed tasks are checked and inert; incomplete ones open in Today.
export function TaskPool({ tasks, onOpen }: TaskPoolProps) {
  const { colors, spacing } = useTheme();
  return (
    <View>
      {tasks.map((task) => {
        const done = task.completedAt != null;
        return (
          <Pressable
            key={task.id}
            disabled={done}
            accessibilityRole="button"
            accessibilityLabel={done ? `${task.title}, done` : `Read ${task.title}`}
            onPress={() => onOpen(task)}
            style={({ pressed }) => [styles.task, { gap: spacing.md, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={done ? colors.accent : colors.border}
            />
            <AppText variant="body" color={done ? 'textMuted' : 'text'} style={styles.title}>
              {task.title}
            </AppText>
            {done ? null : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  task: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_TARGET },
  title: { flex: 1 },
});
