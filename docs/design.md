# Design

Brand: **Oso**. Tagline: "Better books. A calmer mind." The reference mockup for icons and mascot states is [design/oso-brand-sheet.png](design/oso-brand-sheet.png).

Reading stays calm and text-first, with nothing competing with the card. Everything around the card is lively, in the spirit of Duolingo: buttons you can press into, springy entrances, quiz feedback you can feel, and a celebration when you finish.

## Colour tokens

Defined once in `src/theme/tokens.ts`. Components use tokens through `useTheme()` and never raw hex values.

| Token | Light | Dark |
|---|---|---|
| `background` | `#F7F6F2` | `#121614` |
| `surface` | `#EFEDE6` | `#1B201D` |
| `text` | `#1A1F1C` | `#E8E6E1` |
| `textMuted` | `#6B726D` | `#9AA29C` |
| `border` | `#E2DFD6` | `#2A302C` |
| `accent` | `#1F6B4A` | `#4FB387` |
| `accentShade` | `#14482F` | `#2F7A57` |
| `onAccent` | `#F7F6F2` | `#0E1411` |
| `danger` | `#B3412F` | `#E07A67` |

Rules:

- Follow the system colour scheme by default. The manual override is in Settings.
- Never use pure white or pure black as a background.
- **Accent is used only for** the streak badge, primary buttons (with `accentShade` as their lip), the active tab, progress bars, a right quiz answer and the "done" checkmark. Selection in chips and lists is shown with `surface` and weight, not accent.
- `danger` is for error text and a wrong quiz answer.
- **Celebration palette:** `celebration` in `tokens.ts` holds five colours per scheme. It is used only for confetti and topic icon tiles, and nothing else.
- Do not add more accent colours.

## Typography

One font family across the app: **Nunito**, in three weights (Regular, SemiBold, Bold), bundled in `assets/fonts/Nunito/` and loaded at startup. If the fonts fail to load, the app falls back to the system font.

The type scale is `typeScale` in `src/theme/tokens.ts`, used through `<AppText variant="...">`:

| Variant | Size / line height | Weight | Used for |
|---|---|---|---|
| `title` | 28 / 36 | Bold | Screen titles |
| `heading` | 20 / 28 | Bold | Section headings |
| `card` | 21 / 32 | Regular | Card text in the feed |
| `body` | 16 / 24 | Regular | General text |
| `bodyStrong` | 16 / 24 | SemiBold | Emphasis, button labels |
| `caption` | 13 / 19 | Regular | Secondary lines |
| `label` | 12 / 16 | SemiBold, uppercase | Small labels |

Use size and weight for hierarchy, not extra fonts or colours. Card text is left-aligned, one idea per card.

## Spacing and shape

| Token | Values |
|---|---|
| `spacing` | `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, `xxxl` 48 |
| `radius` | `sm` 12, `md` 14, `lg` 16, `pill` 999 |
| Touch target | 44 minimum (`TOUCH_TARGET`) |

- At least 24px of padding on card edges.
- Rounded corners of 12–16px on surfaces and buttons.
- No shadows or gradients. The only decorative edge is the pressable lip on buttons and quiz options.

## Motion and sound

All motion uses React Native's built-in `Animated` with the native driver; there is no animation library. Use the shared primitives in `src/components/motion/` rather than writing one-off animations.

| Primitive | What it does | Used in |
|---|---|---|
| `PopIn` | Plays once on mount: `pop` springs up from small, `rise` slides up while fading in. Optional delay for staggering. | Empty states, recall answers, quiz feedback, chat thinking row, topic badge, add screen |
| `Float` | Slow idle loop: `bob` floats up and down, `wiggle` tilts side to side | Empty-state mascots, the thinking panda |
| `ProgressBar` | Rounded bar that springs to a 0–1 value | Session feed, plan progress, unit generation |
| `Confetti` | One burst of 36 pieces in the celebration colours, about 2 seconds, touches pass through | Done for today, topic recap |
| `TypingDots` | Three dots hopping in turn | Chat while waiting for a reply |
| `usePressScale` | Quick squish on press | Chips, icon buttons, topic rows |
| `useReduceMotion` | Follows the system "reduce motion" setting | Every primitive above |

Component-level motion:

- **Buttons:** primary and secondary buttons sit on a 4px lip (`accentShade` or `border`) and sink into it when pressed. The lip and the pressed margin add up to the same height, so pressing never shifts layout.
- **Streak badge:** when the count goes up, the flame jumps, grows and wiggles, and the number pops.
- **Quiz options:** a right answer pops in `accent`; a wrong one shakes in `danger` while the right one is marked.
- **Provider dropdown:** the chevron turns and the rows rise in one after another.

Rules:

- Card text never moves, bounces or pulses. Motion is for entrances, presses, progress and celebrations.
- With "reduce motion" on, every animation jumps to its end state and loops do not run.
- Three quiet sounds (`tap`, `click`, `streak`) play at low volume, mix with the user's own audio, and stay silent when the phone is on silent. They can be turned off in Settings.

## Shared components

In `src/components/`:

| Component | Purpose |
|---|---|
| `Screen` | Safe area, background, optional scroll and keyboard handling. Also `LoadingLine` and `ErrorLine`. |
| `AppText`, `ErrorText` | All text; picks the type variant and colour token |
| `Button`, `IconButton` | `primary` (accent with a lip), `secondary` (surface with border and a lip), `quiet` (text only) |
| `TextField` | Labelled input with an optional error line |
| `Chips` | Single-choice chips |
| `EmptyState` | Mascot, one line of text, one button; optional `celebrate` (confetti) and suggestion chips |
| `Mascot` | A mascot illustration by state |
| `StreakBadge` | Flame and number in a corner; animates when the count grows |
| `TopicBadge` | A topic's icon on a tile in one of the celebration colours, stable per topic id; falls back to a book |
| `today/QuizOptions` | The options, feedback and explanation of a quiz card |
| `settings/ProviderPicker` | The provider dropdown, marking which providers have a key |

## Mascot

The panda illustrations themselves are static images. They move only through the shared `PopIn` and `Float` wrappers, and never appear inside the card feed.

| State | Used in |
|---|---|
| `reading` | Splash, first run, Today with no API key |
| `noTopics` | Today with no topics, Topics when empty |
| `generating` | Topic generation progress, a topic not prepared yet |
| `chat` | Chat with no plan, Today with a topic that has no plan (older topics) |
| `thinking` | Chat while waiting for a reply |
| `happy` | All topics finished, topic completion recap, plan set in chat |
| `completed` | Today when done for the day |
| `reminder` | Notifications-denied banner, Settings reminder section |
| `error` | Failed generation, invalid key or failed connection test, chat send error |

The streak uses a **badge only**: an `accent` tile (`radius.sm`, no lip) with the flame and number in `onAccent`, as on the brand sheet. The full panda is never shown for the streak. The `noTopics` art is the brand sheet's "No Books" panda.

Keep each mascot at about 120–160px above one line of text and one button. New states should match the existing style and be added to the table above.

## App icon

- **Primary:** the reading panda on a cream tile, `#F7F1E3`.
- **Dark variant:** the same panda on a dark tile, `#132122`, used for iOS dark mode.
- The plain "O" mark is **not** the app icon. It survives only as the Android themed (monochrome) icon, which must be a single-colour shape.
- The notification small icon is the brand panda head: white on transparent, with the ears and eye patches as faint (partial-alpha) shapes, because Android keeps only the alpha and tints it. Built by `scripts/build-icons.sh`.
- Android uses an adaptive icon: panda foreground on a `#F7F1E3` background. Android has no dark adaptive icon.

## Asset files

Replace art by overwriting these files. The names and sizes are what the code and `app.json` expect. Original mockups are kept in `assets/source/`.

| Asset | File(s) | Size | Notes |
|---|---|---|---|
| Mascot state | `assets/mascot/<state>.png`, `@2x`, `@3x` | 160, 320, 480 px square | Transparent. Draw a 960 px square master with the panda centred at the same scale in every state. |
| Panda head | `assets/mascot/pandaIcon.png`, `@2x`, `@3x` | 48, 96, 144 px square | Transparent. Master at 288 px. |
| App icon | `assets/icon.png` | 1024 px square | Opaque, full-bleed `#F7F1E3`, no rounded corners (the OS masks it) |
| iOS dark icon | `assets/icon-dark.png` | 1024 px square | Opaque `#132122` |
| Android adaptive foreground | `assets/android-icon-foreground.png` | 1024 px square | Transparent; art inside the centre 66% |
| Android themed icon | `assets/android-icon-monochrome.png` | 1024 px square | White on transparent, same safe zone |
| Notification small icon | `assets/notification-icon.png` | 96 px square | White on transparent, simple shape |
| Splash | `assets/splash-icon.png` | 1024 px square | Transparent; shown 160 pt wide on `#F7F6F2` / `#121614` |
| Sounds | `assets/sounds/{tap,click,streak}.m4a` | Short and quiet (about -30 dB mean) | AAC. `.webm` does not play on iOS. |

### Rebuilding assets

Both scripts need `ffmpeg`.

```bash
scripts/build-mascots.sh <folder-of-masters>   # resizes masters to @1x/@2x/@3x
scripts/build-icons.sh [master.png]            # icon, dark icon, adaptive foreground, favicon
```

Icon, splash and notification icon changes need a new native build. Mascots and sounds only need a reload.
