import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type TextInput } from 'react-native';

import { AppText, ErrorText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Composer, MessageBubble } from '../src/components/chat/ChatParts';
import { Chips } from '../src/components/Chips';
import { EmptyState } from '../src/components/EmptyState';
import { Mascot } from '../src/components/Mascot';
import { Float } from '../src/components/motion/Float';
import { PopIn } from '../src/components/motion/PopIn';
import { TypingDots } from '../src/components/motion/TypingDots';
import { goToSettings, goToToday } from '../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../src/components/Screen';
import { useFocusLoad } from '../src/components/useFocusLoad';
import { getTopic } from '../src/db/topics';
import { listChatMessages } from '../src/db/chat';
import { listSessions } from '../src/db/sessions';
import { sendChatMessage } from '../src/llm/chat';
import { describeLlmError, isNoKeyError } from '../src/llm/errors';
import { planQuickReply } from '../src/llm/prompts';
import { useTheme } from '../src/theme';

const HISTORY = 50;
const QUICK_REPLIES = [5, 7, 14].map((days) => ({ value: days, label: `${days} days` }));

async function loadChat(topicId: number) {
  const topic = await getTopic(topicId);
  if (!topic) return null;
  const [messages, sessions] = await Promise.all([listChatMessages(topicId, HISTORY), listSessions(topicId)]);
  return { topic, messages, hasPlan: sessions.length > 0 };
}

export default function ChatScreen() {
  const { spacing } = useTheme();
  const headerHeight = useHeaderHeight();
  const params = useLocalSearchParams<{ topicId?: string }>();
  const topicId = Number(params.topicId);
  const { data, loading, error, reload } = useFocusLoad(() => (Number.isInteger(topicId) ? loadChat(topicId) : Promise.resolve(null)));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || pending) return;
    setDraft('');
    setPending(clean);
    setSendError(null);
    setPlanNote(null);
    try {
      const result = await sendChatMessage(topicId, clean);
      if (result.action?.type === 'set_plan') {
        const { days, sessionCount, completedCount } = result.action;
        const left = sessionCount - completedCount;
        const more = completedCount > 0 ? ' more' : '';
        setPlanNote(
          `Plan set: ${days}${more} ${days === 1 ? 'day' : 'days'}, ${left} ${left === 1 ? 'session' : 'sessions'} to go.`,
        );
      }
    } catch (e) {
      if (isNoKeyError(e)) goToSettings();
      else setSendError(describeLlmError(e));
    } finally {
      await reload();
      setPending(null);
    }
  };

  if (loading && !data) return <Screen edges={['bottom']}><LoadingLine /></Screen>;
  if (!data) return <Screen edges={['bottom']}><ErrorLine text={error ?? 'This topic no longer exists.'} /></Screen>;

  const { topic, messages, hasPlan } = data;
  const preparing = topic.status === 'draft' || topic.status === 'generating' || topic.status === 'failed';
  const empty = messages.length === 0 && !pending;

  const footer = (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      {pending ? (
        <>
          {messages.some((m) => m.role === 'user' && m.content === pending) ? null : (
            <MessageBubble message={{ id: -1, topicId, role: 'user', content: pending, createdAt: '' }} />
          )}
          <PopIn kind="rise" style={[styles.row, { gap: spacing.sm }]}>
            <Float kind="wiggle">
              <Mascot state="thinking" size={56} />
            </Float>
            <TypingDots />
          </PopIn>
        </>
      ) : null}
      {sendError ? (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Mascot state="error" size={56} />
          <View style={styles.fill}>
            <ErrorText>{sendError}</ErrorText>
          </View>
        </View>
      ) : null}
      {planNote ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption">{planNote}</AppText>
          <Button label="Go to Today" onPress={goToToday} />
        </View>
      ) : null}
      {!hasPlan && !preparing && !pending && !planNote ? (
        <Chips label="Quick replies" options={QUICK_REPLIES} onChange={(days) => void send(planQuickReply(days))} />
      ) : null}
    </View>
  );

  return (
    <Screen edges={['bottom']} padded={false} keyboard keyboardOffset={headerHeight}>
      <Stack.Screen options={{ title: topic.title }} />
      {preparing ? (
        <AppText variant="caption" center style={{ padding: spacing.md }}>
          This topic is still being prepared. A plan can be set once its units are ready.
        </AppText>
      ) : null}
      {empty && !hasPlan && !preparing && !sendError ? (
        <View style={styles.fill}>
          <EmptyState
            mascot="chat"
            text="How many days do you want to finish this in?"
            buttonLabel="Start planning"
            onPress={() => inputRef.current?.focus()}
          />
          <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>{footer}</View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send(draft)}
        disabled={pending != null || draft.trim().length === 0}
        inputRef={inputRef}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
