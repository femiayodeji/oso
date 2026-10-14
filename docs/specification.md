# Product specification

This document states what Oso does and the rules it must keep. It describes the app as built. Implementation detail lives in [architecture.md](architecture.md), [data-model.md](data-model.md) and [llm.md](llm.md).

## Core principles

These are not negotiable. A change that breaks one of them is the wrong change.

1. **No backend.** The only network calls are direct LLM API calls from the device.
2. **Local-first.** All data lives in SQLite and the app's file system. Everything except generating new content works offline.
3. **Bring your own API key.** The user pastes a key per provider in Settings, picks the active provider, and can change either at any time.
4. **No third-party services.** No Firebase, analytics or telemetry.
5. **Clean UI, playful motion.** Reading stays calm: text-only cards, one font, generous whitespace. Interactions feel lively, Duolingo-style: buttons with a pressable lip, springy entrances, and celebrations on finishing.
6. **Keep it simple.** This is a personal tool. Prefer the boring solution and avoid premature abstraction.

## Non-goals

Accounts, sync, social or competitive features, leaderboards, cloud storage, analytics, vector databases, in-app book reading, and monetization.

## Concepts

### Topic

Anything the user wants to learn, typed as free text: "Stoicism", "How TCP works", "Atomic Habits". When the outline is built, the model decides what the request is:

- **A book it knows**: the units are the book's real chapters, and the author is recorded.
- **An open topic** (a subject, skill, idea, question, person, period or field): the model designs a syllabus that builds from the foundations up.

The model also returns a clean title and an icon from a fixed list. If it cannot build a course (an unknown book, or a request too vague to teach), generation fails with a message suggesting a more specific wording or the user's own material.

Source material is optional:

- **`model_knowledge`**: no file. The model generates from what it knows. The app labels such topics "Generated from model knowledge".
- **`uploaded`**: the user supplies a pdf, epub, txt or md file, or pastes text. The relevant unit's text is sent as context in each prompt. There are no embeddings.

A topic moves through these statuses:

| Status | Meaning |
|---|---|
| `draft` | Created, generation not started |
| `generating` | Outline or units are being prepared |
| `ready` | Every unit is prepared; the topic can be planned and studied |
| `failed` | Generation stopped with at least one unit not done |
| `finished` | Every session is completed |

### Depth

Chosen when adding a topic. It sets how much there is to learn:

| Depth | Open topic | Book (cards per unit) |
|---|---|---|
| Quick taste | 4 to 6 units | 4 to 6 |
| Solid (default) | 8 to 12 units | 6 to 9 |
| Deep dive | 16 to 24 units | 8 to 12 |

A book keeps its own chapters, so depth only changes how many cards each one gets. Uploaded material sizes its cards by the unit's length instead.

### Unit

One section of a topic (a book chapter or one step of a syllabus) with a summary and cards. Each unit has its own generation status (`pending`, `done`, `failed`) so generation can resume where it stopped.

### Card

One idea, text only. Four types:

| Type | Content |
|---|---|
| `summary` | The hook: what the unit is about and why it matters. Exactly one per unit, shown first. |
| `key_idea` | One idea, explained so it stands on its own, with a concrete example where it helps. |
| `recall` | A question on the front and the answer on the back. The learner taps to reveal. |
| `quiz` | A question with 2 to 5 options, exactly one correct. Answering shows right or wrong at once, then a one-sentence explanation. |

About one card in three tests the learner, mixing recall and quiz.

### Session

A day's learning: an ordered run of cards. Sessions form an **ordered pool per topic** and are **not tied to calendar dates**. Any session can be done at any time. Missing a day creates no "overdue" state.

### Plan

The plan is the number of days the learner wants to take. It is set only through chat (for example "finish this in 5 days"):

- The model returns a structured action, `{"action":"set_plan","days":5}`. The app parses, validates and applies it. Free text never changes the plan.
- `days` means **days remaining from now**, not the plan's total length.
- The app splits the unstudied cards into that many balanced, contiguous sessions.
- **Completed sessions are immutable.** Changing the plan only re-splits cards that are not in a completed session.
- All content is generated and saved before a plan can be set.

### Streak

The streak is global across all topics.

- Completing at least one session from any topic on a day counts as activity for that day.
- **Grace rule:** one missed day is allowed. It does not add to the count and does not break the chain. Two full days in a row with no activity reset the streak to zero.
- Today is still in progress, so an empty today is never counted as a missed day.
- The day boundary is the device's local midnight. Dates are stored as local `YYYY-MM-DD`.
- The streak is always computed from the `daily_activity` table. Only the all-time best streak is stored.
- A review-only session completes nothing, so it is not streak activity.

### Spaced review

Recall and quiz cards use Leitner boxes 1 to 5 with intervals of 1, 3, 7, 14 and 30 days.

- A recall or quiz card enters box 1 when its session is completed.
- For recall cards, "Got it" moves the card up one box and "Not yet" sends it back to box 1. For quiz cards, a right answer counts as "Got it" and a wrong one as "Not yet".
- Up to 10 due review cards are appended to a session's feed after its own cards.
- When there is nothing else to do, due cards can be reviewed on their own.

## Screens

Three tabs, plus stack screens opened from them.

| Screen | Route | Purpose |
|---|---|---|
| Today | `/` | The feed for the next session, or an empty state |
| Topics | `/topics` | List of topics, each with its icon and a status line |
| Settings | `/settings` | Provider and API keys, model, reminders, appearance, sounds |
| New topic | `/add-topic?q=` | "What do you want to learn?", suggestions, depth, optional own material |
| Topic | `/topic/[id]` | Generation progress, plan, session pool, units, regenerate and delete |
| Chat | `/chat?topicId=` | Questions about the topic and setting the plan |

### Today

- Shows the lowest-numbered incomplete session of a `ready` topic, under the topic's icon and title. With several topics in progress, chips switch between them.
- The feed is a vertical pager: the session's cards, then due review cards, then a Finish page. A progress bar across the top fills as the learner swipes.
- Finishing completes the session, plays a sound, reschedules reminders, and shows the "Done for today" state with confetti. The streak flame jumps if the count went up.
- Once the day has activity, Today shows "Done for today" with a **Keep learning** button.
- A flag control on each card asks the model to rewrite that card, with an optional note.
- Finishing a topic's last session shows a one-line recap, also with confetti.

### New topic

- One large field: "What do you want to learn?". A tapped suggestion fills it; `?q=` prefills it when arriving from a suggestion elsewhere.
- Six suggestions, which change daily.
- Depth chips: Quick taste, Solid, Deep dive. Hidden when a file is attached, because the file decides the units.
- "Use my own material" reveals file picking and a paste field.
- **Start learning** creates the topic, starts generation, and opens the topic screen.

### Topic

- While generating: "Preparing units, X of Y" with a progress bar. If the app was closed mid-generation, a **Retry** button appears.
- When prepared: the plan summary with a progress bar, the session pool (tap a session to study it in Today), and the unit list.
- Actions: attach or replace a file and regenerate, regenerate, delete. Regenerating replaces units, cards and sessions; the streak is kept.

### Chat

- Grounded in one topic: the system prompt carries the unit summaries and the plan state.
- Only recent history is sent (the last 12 messages).
- With no plan set, quick-reply chips offer 5, 7 and 14 days.
- While waiting for a reply, the thinking panda wiggles beside three hopping dots.
- When the plan changes, the UI confirms it and offers **Go to Today**.

### Settings

- **Provider**: a dropdown of providers, each marked "Key saved" or "No key". The selected one is the one the app uses.
- **API key**: one per provider, saved to the device's secure store and never shown again. Switching provider never asks for a key that is already saved.
- **Model**: base URL (hidden for Anthropic), a model dropdown fetched from the provider, and **Test connection**. Each provider remembers its own model and base URL.
- **Reminders**: permission state and the two reminder times.
- **Appearance**: system, light or dark. **Sounds**: on or off.

## Empty and edge states

Each is one line of text plus one button, with a mascot that pops in and floats gently.

| Where | Text | Button |
|---|---|---|
| Today, no topics | What do you want to learn? | Start learning, plus suggestion chips |
| Today, no API key | Add an API key to start. | Open Settings |
| Today, topic ready without a plan | *Title* is ready. Set a plan to start. | Plan in chat |
| Today, topic generating | Preparing units, X of Y | View topic |
| Today, topic failed | *Title* could not be prepared. | Open topic |
| Today, all sessions done | Done for today. Streak: N. | Keep learning |
| Today, all topics finished | You finished everything. | Learn something new, plus suggestion chips |
| Topics, empty | No topics yet. | Start learning |
| Topic, generating | Preparing units, X of Y | Retry (only if interrupted) |
| Topic, failed | Preparing this topic failed. | Retry |
| Chat, no plan | How many days do you want to finish this in? | Start planning |
| Settings, no API key | Add an API key to start. | (the key field is highlighted) |
| Notifications denied | Reminders are off. | Enable reminders |

**First-run flow:** Settings (API key) → New topic → Chat to set the plan → Today. Each empty state routes to the next step; there is no tutorial.

Any LLM action taken without an API key for the active provider sends the user to Settings instead of showing an error.

## Notifications

Local scheduled notifications only. There is no push server and no background job.

- Two reminders a day: evening (default 18:00) and "running out" (default 21:00). Both times are set in Settings.
- The next 7 days are scheduled each time. If today already has activity, today's reminders are skipped.
- Copy depends on the streak state at the time of scheduling:

| Tone | When | Example title |
|---|---|---|
| Calm | The streak is safe | Time to learn |
| At risk | Yesterday had no activity | Your streak dies tonight |
| Fresh | No live streak | Time to learn |

- Reminders are rescheduled on every app open and every session completion.
- **Known limit:** copy is fixed when scheduled. If the user skips days without opening the app, the copy can be stale until the next open. This is accepted.
- Some Android skins (Xiaomi, Tecno, Infinix) delay notifications through battery optimisation.

## UI rules

- Text-only cards, one idea per card, generous whitespace, one font family.
- A neutral background, dark mode, and one accent colour. Topic icons and confetti use a small separate celebration palette.
- The streak is a small flame and number in a corner. The flame jumps when the streak grows.
- Motion is for entrances, presses, progress and celebrations. Card text itself never moves. Everything goes still when the system "reduce motion" setting is on.
- The panda mascot appears in empty states and chat and never inside the card feed.

Colours, type, motion and assets are specified in [design.md](design.md).
