# Design

Brand: **Oso**. Tagline: "Better books. A calmer mind." The reference mockup for icons and mascot states is [design/oso-brand-sheet.png](design/oso-brand-sheet.png).

The app should feel like a book: quiet, text-first, with nothing competing for attention.

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
| `onAccent` | `#F7F6F2` | `#0E1411` |
| `danger` | `#B3412F` | `#E07A67` |

Rules:

- Follow the system colour scheme by default. The manual override is in Settings.
- Never use pure white or pure black as a background.
- **Accent is used only for** the streak badge, primary buttons, the active tab and the "done" checkmark. Selection in chips and lists is shown with `surface` and weight, not accent.
- `danger` is for error text only.
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
- No shadows, gradients or decorative borders.

## Motion and sound

- No animations beyond the native swipe and screen transitions. No confetti, bounce or pulsing.
- Three quiet sounds (`tap`, `click`, `streak`) play at low volume, mix with the user's own audio, and stay silent when the phone is on silent. They can be turned off in Settings.

## Shared components

In `src/components/`:

| Component | Purpose |
|---|---|
| `Screen` | Safe area, background, optional scroll and keyboard handling. Also `LoadingLine` and `ErrorLine`. |
| `AppText`, `ErrorText` | All text; picks the type variant and colour token |
| `Button`, `IconButton` | `primary` (accent), `secondary` (surface with border), `quiet` (text only) |
| `TextField` | Labelled input with an optional error line |
| `Chips` | Single-choice chips |
| `EmptyState` | Mascot, one line of text, one button |
| `Mascot` | A static mascot illustration by state |
| `StreakBadge` | Flame and number in a corner |

## Mascot

The panda appears as static illustrations only. It is never animated and never appears inside the card feed.

| State | Used in |
|---|---|
| `reading` | Splash, first run, Today with no API key |
| `noBooks` | Today with no books, Books when empty |
| `generating` | Book generation progress |
| `chat` | Chat with no plan |
| `thinking` | Chat while waiting for a reply |
| `happy` | All books finished, book completion recap |
| `completed` | Today when done for the day |
| `reminder` | Notifications-denied banner, Settings reminder section |
| `error` | Failed generation, invalid key, network error |

The streak uses a **badge only** (flame plus number). The full panda is never shown for the streak.

Keep each mascot at about 120–160px above one line of text and one button. New states should match the existing style and be added to the table above.

## App icon

- **Primary:** the reading panda on a cream tile, `#F7F1E3`.
- **Dark variant:** the same panda on a dark tile, `#132122`, used for iOS dark mode.
- The plain "O" mark is **not** the app icon. It survives only as the Android themed (monochrome) icon and the notification small icon, which must be single-colour shapes.
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
