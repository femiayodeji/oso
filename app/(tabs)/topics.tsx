import { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { TopicRow } from '../../src/components/topics/TopicRow';
import { loadTopics } from '../../src/components/topics/topicData';
import { IconButton } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { goToAddTopic, goToTopic } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { subscribeGeneration } from '../../src/llm/pipeline';
import { useTheme } from '../../src/theme';

export default function TopicsScreen() {
  const { spacing } = useTheme();
  const { data, loading, error, reload } = useFocusLoad(loadTopics);

  useEffect(() => subscribeGeneration(() => void reload()), [reload]);

  let body;
  if (!data) {
    body = loading ? <LoadingLine /> : <ErrorLine text={error ?? 'Could not load topics.'} />;
  } else if (data.length === 0) {
    body = <EmptyState mascot="noTopics" text="No topics yet." buttonLabel="Start learning" onPress={() => goToAddTopic()} />;
  } else {
    body = (
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.topic.id)}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md }}
        renderItem={({ item }) => <TopicRow item={item} onPress={() => goToTopic(item.topic.id)} />}
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: spacing.xl, paddingTop: spacing.sm }]}>
        <AppText variant="title" accessibilityRole="header">
          Topics
        </AppText>
        {data && data.length > 0 ? <IconButton icon="add" label="Add a topic" size={26} onPress={() => goToAddTopic()} /> : null}
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});
