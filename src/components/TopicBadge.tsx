import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { iconColorIndex } from '../topic/icons';
import { celebration, useTheme } from '../theme';
import type { Topic } from '../types';

// The topic's icon on a tile in one of the celebration colours, stable per topic.
// A topic without an icon (uploaded material, older topics) shows a book.
export function TopicBadge({ topic, size = 40 }: { topic: Pick<Topic, 'id' | 'icon'>; size?: number }) {
  const { colors, scheme, radius } = useTheme();
  const palette = celebration[scheme];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(radius.md, size / 3),
        backgroundColor: palette[iconColorIndex(topic.id, palette.length)],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={topic.icon ?? 'book'} size={Math.round(size * 0.55)} color={colors.background} />
    </View>
  );
}
