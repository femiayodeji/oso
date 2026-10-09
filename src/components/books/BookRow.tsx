import { Pressable, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../AppText';
import { statusLine, type BookSummary } from './bookData';

interface Props {
  item: BookSummary;
  onPress: () => void;
}

export function BookRow({ item, onPress }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { book } = item;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title}. ${statusLine(item)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.xs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <AppText variant="bodyStrong">{book.title}</AppText>
      {book.author ? <AppText variant="caption">{book.author}</AppText> : null}
      <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
        <AppText variant="caption" color={book.status === 'failed' ? 'danger' : 'textMuted'}>
          {statusLine(item)}
        </AppText>
        {book.source === 'model_knowledge' ? <AppText variant="label">Generated from model knowledge</AppText> : null}
      </View>
    </Pressable>
  );
}
