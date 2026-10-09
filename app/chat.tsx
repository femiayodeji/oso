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
import { goToSettings, goToToday } from '../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../src/components/Screen';
import { useFocusLoad } from '../src/components/useFocusLoad';
import { getBook } from '../src/db/books';
import { listChatMessages } from '../src/db/chat';
import { listTasks } from '../src/db/tasks';
import { sendChatMessage } from '../src/llm/chat';
import { describeLlmError, isNoKeyError } from '../src/llm/errors';
import { planQuickReply } from '../src/llm/prompts';
import { useTheme } from '../src/theme';

const HISTORY = 50;
const QUICK_REPLIES = [5, 7, 14].map((days) => ({ value: days, label: `${days} days` }));

async function loadChat(bookId: number) {
  const book = await getBook(bookId);
  if (!book) return null;
  const [messages, tasks] = await Promise.all([listChatMessages(bookId, HISTORY), listTasks(bookId)]);
  return { book, messages, hasPlan: tasks.length > 0 };
}

export default function ChatScreen() {
  const { spacing } = useTheme();
  const headerHeight = useHeaderHeight();
  const params = useLocalSearchParams<{ bookId?: string }>();
  const bookId = Number(params.bookId);
  const { data, loading, error, reload } = useFocusLoad(() => (Number.isInteger(bookId) ? loadChat(bookId) : Promise.resolve(null)));
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
      const result = await sendChatMessage(bookId, clean);
      if (result.action?.type === 'set_plan') {
        const { days, taskCount } = result.action;
        setPlanNote(`Plan set: ${days} ${days === 1 ? 'day' : 'days'}, ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}.`);
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
  if (!data) return <Screen edges={['bottom']}><ErrorLine text={error ?? 'This book no longer exists.'} /></Screen>;

  const { book, messages, hasPlan } = data;
  const preparing = book.status === 'draft' || book.status === 'generating' || book.status === 'failed';
  const empty = messages.length === 0 && !pending;

  const footer = (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      {pending ? (
        <>
          {messages.some((m) => m.role === 'user' && m.content === pending) ? null : (
            <MessageBubble message={{ id: -1, bookId, role: 'user', content: pending, createdAt: '' }} />
          )}
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Mascot state="thinking" size={56} />
            <AppText variant="caption">Thinking…</AppText>
          </View>
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
      <Stack.Screen options={{ title: book.title }} />
      {preparing ? (
        <AppText variant="caption" center style={{ padding: spacing.md }}>
          This book is still being prepared. A plan can be set once its chapters are ready.
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
