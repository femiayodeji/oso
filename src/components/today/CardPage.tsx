import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCard, reviewCard, setCardFlagged } from '../../db/cards';
import { todayLocal } from '../../lib/dates';
import { describeLlmError, isNoKeyError } from '../../llm/errors';
import { regenerateCard } from '../../llm/pipeline';
import { playSound } from '../../sound';
import { useTheme } from '../../theme';
import type { Card, CardType } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button, IconButton } from '../Button';
import { goToSettings } from '../nav';
import { FlagControl } from './FlagControl';

const TYPE_LABEL: Record<CardType, string> = { summary: 'Summary', key_idea: 'Key idea', recall: 'Recall' };

interface Props {
  card: Card;
  review: boolean;
  height: number;
  position: string;
  onReplace: (card: Card) => void;
}

export function CardPage({ card, review, height, position, onReplace }: Props) {
  const { colors, spacing } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recall = card.type === 'recall';

  const reveal = () => {
    if (revealed) return;
    playSound('tap');
    setRevealed(true);
  };

  const toggleFlag = () => {
    playSound('tap');
    setError(null);
    setFlagOpen((open) => !open);
  };

  const rewrite = async (note: string) => {
    setFlagOpen(false);
    setRewriting(true);
    setError(null);
    try {
      await setCardFlagged(card.id, true);
      await regenerateCard(card.id, note || undefined);
      const fresh = await getCard(card.id);
      if (fresh) onReplace(fresh);
      setRevealed(false);
    } catch (e) {
      if (isNoKeyError(e)) goToSettings();
      else setError(describeLlmError(e));
    } finally {
      setRewriting(false);
    }
  };

  const answer = async (remembered: boolean) => {
    setReviewed(true);
    try {
      await reviewCard(card.id, remembered, todayLocal());
    } catch {
      setReviewed(false);
      setError('Could not save that. Try again.');
    }
  };

  return (
    <View style={{ height, padding: spacing.xl }}>
      <View style={styles.top}>
        <AppText variant="label">{review ? `Review · ${TYPE_LABEL[card.type]}` : TYPE_LABEL[card.type]}</AppText>
        <IconButton
          icon={card.flagged || flagOpen ? 'flag' : 'flag-outline'}
          label="Flag this card for a rewrite"
          size={18}
          disabled={rewriting}
          onPress={toggleFlag}
        />
      </View>
      {flagOpen ? <FlagControl onRewrite={rewrite} onCancel={() => setFlagOpen(false)} /> : null}
      {rewriting ? <AppText variant="caption">rewriting…</AppText> : null}
      <ErrorText>{error}</ErrorText>

      <Pressable
        style={[styles.body, { gap: spacing.xl }]}
        disabled={!recall || revealed}
        onPress={reveal}
        accessibilityRole={recall && !revealed ? 'button' : undefined}
        accessibilityHint={recall && !revealed ? 'Reveals the answer' : undefined}
      >
        <AppText variant="card">{card.front}</AppText>
        {recall && !revealed ? <AppText variant="caption">Tap to reveal</AppText> : null}
        {recall && revealed ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xl }}>
            <AppText variant="card">{card.back ?? ''}</AppText>
          </View>
        ) : null}
      </Pressable>

      {review && revealed && !reviewed ? (
        <View style={[styles.actions, { gap: spacing.md }]}>
          <Button label="Got it" variant="secondary" style={styles.action} onPress={() => answer(true)} />
          <Button label="Not yet" variant="secondary" style={styles.action} onPress={() => answer(false)} />
        </View>
      ) : null}
      <AppText variant="caption" center style={{ paddingTop: spacing.md }}>
        {reviewed ? `Noted · ${position}` : position}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  body: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  actions: { flexDirection: 'row' },
  action: { flex: 1 },
});
