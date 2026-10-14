import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme } from '../../theme';
import type { UnitHead } from '../../db/units';
import type { Session } from '../../types';
import { AppText } from '../AppText';

export function UnitList({ units }: { units: UnitHead[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="heading" accessibilityRole="header">
        Units
      </AppText>
      {units.map((unit) => (
        <View key={unit.id} style={{ gap: spacing.xs }}>
          <AppText variant="bodyStrong">{unit.title}</AppText>
          {unit.summary ? <AppText variant="body">{unit.summary}</AppText> : null}
          {unit.genStatus === 'failed' ? (
            <AppText variant="caption" color="danger">
              This unit could not be prepared.
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

interface SessionPoolProps {
  sessions: Session[];
  onOpen: (session: Session) => void;
}

// Ordered pool. Completed sessions are checked and inert; incomplete ones open in Today.
export function SessionPool({ sessions, onOpen }: SessionPoolProps) {
  const { colors, spacing } = useTheme();
  return (
    <View>
      {sessions.map((session) => {
        const done = session.completedAt != null;
        return (
          <Pressable
            key={session.id}
            disabled={done}
            accessibilityRole="button"
            accessibilityLabel={done ? `${session.title}, done` : `Read ${session.title}`}
            onPress={() => onOpen(session)}
            style={({ pressed }) => [styles.session, { gap: spacing.md, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={done ? colors.accent : colors.border}
            />
            <AppText variant="body" color={done ? 'textMuted' : 'text'} style={styles.title}>
              {session.title}
            </AppText>
            {done ? null : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  session: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_TARGET },
  title: { flex: 1 },
});
