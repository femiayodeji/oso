import { Animated, Pressable, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../AppText';
import { usePressScale } from '../motion/usePressScale';
import { TopicBadge } from '../TopicBadge';
import { statusLine, type TopicSummary } from './topicData';

interface Props {
  item: TopicSummary;
  onPress: () => void;
}

export function TopicRow({ item, onPress }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { topic } = item;
  const squish = usePressScale(0.97);
  return (
    <Animated.View style={squish.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${topic.title}. ${statusLine(item)}`}
        onPress={onPress}
        onPressIn={squish.onPressIn}
        onPressOut={squish.onPressOut}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
          flexDirection: 'row',
        }}
      >
        <TopicBadge topic={topic} size={44} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="bodyStrong">{topic.title}</AppText>
          {topic.author ? <AppText variant="caption">{topic.author}</AppText> : null}
          <AppText variant="caption" color={topic.status === 'failed' ? 'danger' : 'textMuted'}>
            {statusLine(item)}
          </AppText>
          {topic.source === 'model_knowledge' ? <AppText variant="label">Generated from model knowledge</AppText> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
