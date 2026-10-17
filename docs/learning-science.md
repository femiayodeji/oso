# Learning science: how big a session should be

Oso replaces doom-scrolling with a short daily session of cards. This page explains how big a session should be, why, and where the numbers live in the code. No study gives an exact "best card count". The numbers below are estimates built from well-replicated findings, so change the constants if real use shows they're wrong.

## The numbers

| Rule | Value | Constant |
|---|---|---|
| New cards per session (target) | about 10 | `CARDS_PER_SESSION` in `src/plan/budget.ts` |
| New cards per session (cap) | 12 | `MAX_CARDS_PER_SESSION` in `src/plan/budget.ts` |
| Review cards appended to a session | at most 5 | `REVIEW_LIMIT` in `src/components/today/SessionFeed.tsx` |
| Whole session | at most about 15 cards, 5 to 7 minutes | |
| Cards per unit | 3 to 12 | `MIN_CARDS_PER_UNIT`, `MAX_CARDS_PER_UNIT` in `src/plan/budget.ts` |

About one card in three is recall or quiz (`CARD_RULES` in `src/llm/prompts.ts`). So a 10-card session holds about 6 new ideas and 4 checks.

## Why about 10

### 1. Working memory holds about 4 new items

Cowan (2001) revised Miller's (1956) "seven plus or minus two" down to about 3 to 5 chunks held at once. Cognitive load theory (Sweller, 1988) builds on this: new material that exceeds working memory is not processed into long-term memory, however long the learner keeps reading. About 6 new ideas, each followed soon by a check, is close to what a learner can take in and connect in one sitting. At 20 cards, about 12 new ideas arrive, and the later ones push out the earlier ones before they stick.

### 2. Spreading learning out beats cramming

The spacing effect is one of the most replicated findings in learning research (Ebbinghaus, 1885; meta-analysis in Cepeda et al., 2006). The same material studied over more, shorter sessions is remembered much better than the same material massed into fewer, longer ones. Ten cards a day for 6 days beats 20 cards a day for 3 days, even though it's the same content. A long session is cramming, even when it's labelled "today's session".

### 3. Being tested helps memory more than rereading

Retrieving an answer strengthens memory more than reading it again (the testing effect; Roediger and Karpicke, 2006). That's why recall and quiz cards make up about a third of each unit, and why review cards earn a place in a session. Reviews are capped at 5 so they reinforce the session rather than becoming a second one.

### 4. It has to fit the moment it replaces

Scrolling happens in short bursts, so a session has to fit one. Adults read non-fiction at about 240 words per minute (Brysbaert, 2019). A 40 to 60 word card takes about 15 seconds; a recall or quiz card, with thinking, about 20 to 30 seconds.

| Cards | Time | Feels like |
|---|---|---|
| 10 | about 4 min | A quick break, easy to do every day |
| 15 | about 6 min | Still light |
| 21 | 9 to 10 min | A chore, so it gets skipped |

### 5. Doing it every day matters more than the amount

Habits form through repetition in a stable context, and a missed day matters less than the overall routine (Lally et al., 2010). For a streak-based app, a session that's easy to finish every day beats a bigger one that gets skipped. This is also why the streak forgives one missed day.

### 6. For comparison, Anki defaults to 20 new cards a day

Anki's cards are usually single facts, such as a word or a date. An Oso card is a whole idea with its explanation, so a lower number fits.

## How the app enforces it

The plan length is chosen **before** generation, so content is sized to fit the days, not split to fit afterwards.

1. **Add topic** asks "How long?": 3 days, 1 week, 2 weeks, or 1 month. This replaces the old depth choice, because more days already means more depth. It's stored as the topic's `plan_days`.
2. **Card budget** = days × 10. For an open topic, the outline gets a unit count from the budget. A book keeps its real chapters.
3. **Each unit's card call** is told its own card count: the budget shared across the units, kept within 3 to 12. For uploaded material, a unit's share follows its length.
4. **A book that can't fit** (for example 30 chapters in 3 days, since at least 3 cards per chapter would mean 30 a day) gets its plan stretched to the minimum number of days that fits. The topic screen says so in one line, and the user can still change it in chat.
5. **The plan is set when generation finishes**, so the user goes Add topic → Today with no chat step.
6. **Changing the plan later in chat** warns rather than blocks. If the new plan means more than 12 cards a day, the confirmation says how many and suggests the number of days that keeps it near 10. If the user insists, the app does what they asked.

The model doesn't hit counts exactly, so the prompts only steer it. The guarantee comes from the app: the budget code decides the counts, and the splitter balances the sessions.

Topics created before this change keep their depth-based card counts. They are re-split under the same rules whenever their plan changes.

## References

- Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. *Journal of Memory and Language*, 109.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., and Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3).
- Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1).
- Ebbinghaus, H. (1885). *Über das Gedächtnis* (Memory: A Contribution to Experimental Psychology).
- Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., and Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6).
- Miller, G. A. (1956). The magical number seven, plus or minus two. *Psychological Review*, 63(2).
- Roediger, H. L., and Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3).
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2).
