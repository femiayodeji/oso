# Oso documentation

Oso is a personal-use mobile app that turns a book into a scrollable feed of summaries and flashcards, so reading replaces doom-scrolling. It runs for one user on one device and has no backend: the only network calls go straight from the phone to an LLM provider, using an API key the user pastes into Settings.

Tagline: "Better books. A calmer mind."

## Where to start

| You want to | Read |
|---|---|
| Understand what the app does and the rules it follows | [specification.md](specification.md) |
| Get the project running on a machine and a phone | [setup.md](setup.md) |
| Understand how the code is organised and how data flows | [architecture.md](architecture.md) |
| Look up a table, a status value, or an invariant | [data-model.md](data-model.md) |
| Work on providers, prompts, generation or chat | [llm.md](llm.md) |
| Change colours, type, mascots or icons | [design.md](design.md) |
| Add a feature, write a test, or see what is left to do | [development.md](development.md) |

## The app in one page

1. The user pastes an API key in **Settings** and picks a provider and model.
2. They **add a book** by title, optionally attaching the text (pdf, epub, txt, md, or pasted).
3. The app builds a chapter outline, then generates a summary and study cards for each chapter, saving after every chapter.
4. In **Chat** the user says how many days they want to finish in. The app splits the cards into that many tasks.
5. **Today** shows the next task as a vertical feed, one card per page. Finishing a task records activity for the day.
6. A **streak** counts active days, with one missed day forgiven. Local **reminders** fire in the evening.
7. Recall cards from finished tasks come back later for **spaced review**.

## Stack

| Concern | Choice |
|---|---|
| Framework | React Native 0.86 with Expo SDK 57, TypeScript strict |
| Navigation | `expo-router` |
| Storage | `expo-sqlite` for data, `expo-secure-store` for the API key, `expo-file-system` for book files |
| Notifications | `expo-notifications`, local scheduled only |
| Validation | `zod`, on every LLM JSON reply |
| Tests | `jest` with `jest-expo`, pure logic only |
| State | React hooks and direct repository calls; one small settings context |

There is no backend, analytics, telemetry, Firebase, global state library, LangChain, or vector database, and none should be added.

## Related files outside this folder

- `CLAUDE.md` is the standing rule set for AI coding agents working in this repository. These docs describe the code as built; where the two differ, see "Differences from CLAUDE.md" in [development.md](development.md).
- `AGENTS.md` holds Expo-specific guidance for agents, including the rule to check versioned Expo docs before using an Expo API.
- `docs/design/oso-brand-sheet.png` is the reference mockup for icons and mascot states.
