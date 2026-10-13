# Development guide

How to keep working on Oso: conventions, where things go, recipes for common changes, and what is left to build.

## Conventions

- **TypeScript strict.** No `any` without a comment explaining it.
- **SQL only in `src/db/`.** Components call repository functions.
- **Pure where possible.** `computeStreak`, the plan splitter, JSON parsing, the reminder schedule and chapter detection are pure functions with unit tests. Keep new logic of that kind pure too.
- **Prompts only in `src/llm/prompts.ts`.**
- **Dates through one helper.** Use `todayLocal()` and friends from `src/lib/dates.ts`. Never `toISOString().slice(0, 10)` for "today"; that is the UTC date.
- **Colours through tokens.** No raw hex values outside `src/theme/tokens.ts`.
- **Small files, small functions.** Every async screen handles loading, empty and error states.
- **No new dependencies without need.** No global state library, no LangChain, no analytics.
- **Add packages with `npx expo install`**, and check the versioned Expo docs before using an Expo API; they change between SDK releases.

Before calling a change done:

```bash
npm run typecheck
npm test
```

## Testing

Unit tests cover pure logic only and live in `__tests__/` folders next to the code.

| Area | Test file |
|---|---|
| Streak: grace rule, gap of exactly two days, midnight edges | `src/streak/__tests__/computeStreak.test.ts` |
| Local date helpers | `src/lib/__tests__/dates.test.ts` |
| Plan splitter | `src/plan/__tests__/splitPlan.test.ts` |
| Reminder schedule and copy | `src/notifications/__tests__/` |
| Leitner intervals | `src/db/__tests__/leitner.test.ts` |
| LLM layer | `src/llm/__tests__/` (see [llm.md](llm.md)) |

There are no component or end-to-end tests. Notifications, offline behaviour and generation resume are checked by hand on a device; the checklist is in [setup.md](setup.md).

## Recipes

### Add a provider

1. Add the id to the `Provider` type in `src/types.ts`.
2. Add an entry to `PROVIDERS` in `src/llm/providers.ts` with its label, base URL and default model.
3. Add the id to the `PROVIDERS` list in `src/db/settings.ts`, or the saved setting will be read back as the default provider.
4. If the provider is OpenAI-compatible, that is all: the client routes everything except `anthropic` through the OpenAI-compatible adapter.
5. If it needs its own wire format, add an adapter in `src/llm/adapters/` and branch on it in `complete()` and `listModels()`.
6. Confirm the default model id exists by calling the provider's `/models` endpoint.

### Change a default model

Edit `defaultModel` in `src/llm/providers.ts`. Nothing else stores default ids.

### Change the database schema

1. **Append** a new SQL string to `MIGRATIONS` in `src/db/schema.ts`. Never edit an existing entry.
2. Update the matching type in `src/types.ts` and the row mapping in the repository.
3. Update [data-model.md](data-model.md).

### Add a card type

1. Extend the `CHECK` on `cards.type` with a migration. SQLite cannot alter a check constraint, so this means rebuilding the table.
2. Add it to `CardType` in `src/types.ts` and to `cardSchema` in `src/llm/schemas.ts`.
3. Describe it in `CARD_RULES` in `src/llm/prompts.ts`.
4. Add its label and rendering in `src/components/today/CardPage.tsx`.

### Add a chat action

1. Extend `chatActionSchema` in `src/llm/schemas.ts` (make it a union).
2. Describe when to emit it in `chatSystemPrompt`.
3. Handle it in `sendChatMessage` in `src/llm/chat.ts` and confirm it in `app/chat.tsx`.

Keep the rule that the app, not the model's prose, changes state.

### Change the streak rule

All of it is in `src/streak/computeStreak.ts`. `MAX_GAP = 2` encodes the grace rule: two active days belong to one chain when at most one full day lies between them. Update `computeStreak.test.ts` and check `toneForDay` in `src/notifications/schedule.ts`, which depends on the same rule.

### Change reminder copy or timing

- Copy: `src/notifications/copy.ts`.
- Which days and times are scheduled: `buildReminderSchedule` in `src/notifications/schedule.ts`.
- Defaults: `DEFAULT_SETTINGS` in `src/db/settings.ts`.

### Add a mascot state

1. Draw a 960 px square master in the same style and run `scripts/build-mascots.sh`.
2. Add the state to `MascotState` and its `require` in `src/components/Mascot.tsx`.
3. Add it to the state list in `scripts/build-mascots.sh` and to the table in [design.md](design.md).

### Add a screen

Add a file under `app/`; expo-router makes it a route. Register a title in the root stack in `app/_layout.tsx`, add a helper in `src/components/nav.ts`, and load its data with `useFocusLoad`.

## Git workflow

- `main` is the working branch; feature work has been done on short-lived branches and merged.
- There is no remote configured.
- `android/`, `ios/`, `.expo/`, `.env` and `books/` (local sample books) are gitignored.

## Build history

The app was built in this order. All ten steps are implemented.

1. Project scaffold, theme, navigation, empty states.
2. SQLite schema, migrations, repositories.
3. Settings: API key, provider and model, reminder times.
4. LLM client and adapters, with a test call from Settings.
5. Add book and the resumable generation pipeline.
6. Today feed, task completion, `daily_activity`, `computeStreak`.
7. Chat with grounded Q&A and the `set_plan` action.
8. Notifications: permission, `syncReminders`, copy states.
9. Flag and regenerate a card; file upload (pdf, epub, txt, md, pasted text).
10. Spaced recall (Leitner), best streak, recap on book completion.

## Known limits

| Limit | Detail |
|---|---|
| One API key for all providers | Switching provider means pasting a different key |
| Stale reminder copy | Copy is fixed at schedule time; skipping days without opening the app can leave it out of date until the next open |
| No background generation | Generation runs only while the app is open; it resumes on the next open |
| Scanned PDFs | PDFs without a text layer yield no readable text; there is no OCR |
| Free models | Free models can fail the JSON checks more often and give weaker summaries |
| Android OEM battery optimisation | Can delay reminders on some phones |
| Flagged cards | A card is flagged when a rewrite is requested and unflagged when it succeeds, so a card stays flagged only if its rewrite failed. There is no screen listing flagged cards. |

## Open questions and ideas

None of these are committed plans.

- **Per-provider API keys**, so switching provider does not mean re-pasting a key.
- **A standalone release build** for daily use, so the phone does not need the dev server. Not yet tried in this repository.
- **Confirm the grace rule**: a missed grace day currently neither adds to the streak nor breaks it.
- **Splash art** is 400 px; the target is 1024 px.

## Differences from CLAUDE.md

`CLAUDE.md` was written as the plan; the code has moved on in a few places. These docs describe the code.

| Topic | CLAUDE.md | Code today |
|---|---|---|
| Font | System font by default | Nunito, bundled in three weights |
| Providers | OpenRouter, OpenAI, Anthropic | Also Gemini and Groq |
| Model setting | Free-text model name | Dropdown fetched from the provider, with hand entry still possible |
| Sounds | Not mentioned | Three quiet UI sounds, with a Settings toggle |
| Reminder window | Next 5–7 days | 7 days |
| Upload formats | pdf, epub, txt, pasted text | Also `.md` |
| Extra dependencies | Not listed | `jszip` and `pako` (epub and pdf parsing), `expo-audio`, `expo-font`, `expo-dev-client` |

When changing one of these areas, update `CLAUDE.md` too so agents working in the repository get the current rules.
