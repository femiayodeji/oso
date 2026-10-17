# Oso documentation

Oso is a personal-use mobile app for habitual learning. You type anything you want to learn (a topic, a skill, a question, or a book) and Oso turns it into a daily feed of short, engaging cards, so learning replaces doom-scrolling. It runs for one user on one device and has no backend: the only network calls go straight from the phone to an LLM provider, using API keys the user pastes into Settings.

Tagline: "Better books. A calmer mind."

## Where to start

| You want to | Read |
|---|---|
| Understand what the app does and the rules it follows | [specification.md](specification.md) |
| Get the project running on a machine and a phone | [setup.md](setup.md) |
| Understand how the code is organised and how data flows | [architecture.md](architecture.md) |
| Look up a table, a status value, or an invariant | [data-model.md](data-model.md) |
| Work on providers, prompts, generation or chat | [llm.md](llm.md) |
| Change colours, type, motion, mascots or icons | [design.md](design.md) |
| Understand why a session is about 10 cards | [learning-science.md](learning-science.md) |
| Add a feature, write a test, or see what is left to do | [development.md](development.md) |

## The app in one page

1. The user pastes an API key per provider in **Settings** and picks the active provider and its model.
2. They **add a topic** by answering "What do you want to learn?", picking how long they want to take (3 days to 1 month), and optionally attaching their own material (pdf, epub, txt, md, or pasted text).
3. The model decides whether the request is a book it knows or an open topic, and builds an outline of **units**. The app then generates a summary and cards for each unit, saving after every unit.
4. The plan length sized the content, so the app splits the cards into that many **sessions** of about 10 cards each. **Chat** answers questions and can change the plan later.
5. **Today** shows the next session as a vertical feed, one card per page, with a progress bar. Finishing a session records activity for the day and celebrates.
6. A **streak** counts active days, with one missed day forgiven. Local **reminders** fire in the evening.
7. Recall and quiz cards from finished sessions come back later for **spaced review**.

## Stack

| Concern | Choice |
|---|---|
| Framework | React Native 0.86 with Expo SDK 57, TypeScript strict |
| Navigation | `expo-router` |
| Storage | `expo-sqlite` for data, `expo-secure-store` for API keys, `expo-file-system` for uploaded material |
| Notifications | `expo-notifications`, local scheduled only |
| Validation | `zod`, on every LLM JSON reply |
| Motion | React Native's built-in `Animated` with the native driver |
| Tests | `jest` with `jest-expo`, pure logic only |
| State | React hooks and direct repository calls; one small settings context |

There is no backend, analytics, telemetry, Firebase, global state library, animation library, LangChain, or vector database, and none should be added.

## Related files outside this folder

- `CLAUDE.md` is the standing rule set for AI coding agents working in this repository. These docs describe the code as built; where the two differ, see "Differences from CLAUDE.md" in [development.md](development.md).
- `AGENTS.md` holds Expo-specific guidance for agents, including the rule to check versioned Expo docs before using an Expo API.
- `docs/design/oso-brand-sheet.png` is the reference mockup for icons and mascot states.
- `docs/todo.md` lists ideas not yet built.
