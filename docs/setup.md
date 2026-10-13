# Setup

How to get Oso running from a fresh clone, on a real phone. The app needs a **development build**, not Expo Go, because local notifications and the other native modules are not all available there.

## Prerequisites

| Tool | Version used | Needed for |
|---|---|---|
| Node.js | 22 | Everything |
| npm | 11 | Installing packages |
| JDK | 17 | Android builds |
| Android SDK | Platform, build-tools, NDK and CMake (Gradle installs missing parts) | Android builds |
| `adb` | Any recent platform-tools | Installing on a phone |
| Xcode on macOS | Current | iOS builds only |
| `ffmpeg` | Any recent | Only for `scripts/build-icons.sh` and `scripts/build-mascots.sh` |

Set `ANDROID_HOME` to the SDK path and `JAVA_HOME` to the JDK.

## Install

```bash
git clone <repo-url> oso
cd oso
npm install
```

`.npmrc` sets `legacy-peer-deps=true`, so a plain `npm install` works.

To add a package, use `npx expo install <package>` rather than `npm install`. It picks the version that matches the Expo SDK.

## Check the project

```bash
npm run typecheck    # tsc --noEmit
npm test             # jest, pure logic only
```

Both should pass on a clean checkout.

## Run on an Android phone

1. On the phone, enable Developer options and **USB debugging**, then plug it in and accept the debugging prompt.
2. Confirm the computer sees it:

   ```bash
   adb devices
   ```

3. Build, install and start the dev server:

   ```bash
   npx expo run:android
   ```

The first native build takes a while (about 15 minutes on a modest laptop). Later JS changes hot-reload without rebuilding.

The `android/` folder is generated and gitignored. Never edit it by hand; native settings belong in `app.json`. To regenerate it after changing `app.json`, icons or native dependencies:

```bash
npx expo prebuild -p android
```

### When a rebuild is needed

| Change | Action |
|---|---|
| TypeScript, screens, prompts | None; Metro hot-reloads |
| Mascots, sounds | Reload the app |
| A new native package, `app.json`, icons, splash, notification icon | `npx expo prebuild -p android` and a new native build |

## Run on an iPhone

Requires a Mac with Xcode.

```bash
npx expo run:ios
```

## Windows with WSL

Building inside WSL while the phone is plugged into Windows needs a few extra steps, because the phone is visible only to the Windows `adb.exe`, not to the Linux `adb`.

### One-time build and install

```bash
npx expo prebuild -p android --no-install
(cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a)
adb.exe install -r "$(wslpath -w android/app/build/outputs/apk/debug/app-debug.apk)"
```

`-PreactNativeArchitectures=arm64-v8a` builds only for the phone's architecture, which is much faster.

### Running the dev server

```bash
scripts/dev-phone.sh
```

Leave it running; Ctrl+C stops it. The script:

- starts Metro on port 8081 if it is not already running;
- starts a small IPv4 relay on port 8082 that passes through to Metro;
- waits for the phone, installs the APK if the app is missing, forwards the phone's port 8081 to the relay, and opens the app;
- restores the port forward and reopens the app whenever the phone reconnects.

**Why the relay exists:** `adb reverse` sends the phone's traffic to Windows `127.0.0.1`. Metro inside WSL listens on IPv6, which Windows can reach as `localhost` but not as `127.0.0.1`. Without the relay the phone shows "unexpected end of stream".

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `adb.exe: no devices/emulators found` | The phone dropped off USB. Replug, unlock, and accept the debugging prompt. Try another cable or a port directly on the laptop. |
| "Unexpected end of stream" on `localhost:8081` | The port forward points at Metro directly instead of the relay. Run `scripts/dev-phone.sh`. |
| App opens to the Expo launcher screen | Tap `http://localhost:8081`, or let `scripts/dev-phone.sh` open it. |
| The app cannot find the dev server after replugging | The forward is lost on every disconnect. The script restores it within a few seconds. |

## First run in the app

1. **Settings**: paste an API key, pick the provider, and press **Test connection**.
2. **Add a book**: a title is enough; attach the text for better accuracy.
3. Wait for "Preparing chapters, X of Y" to finish.
4. **Chat**: say how many days you want to finish in.
5. **Today**: read the first task.

Free providers work for trying the app: OpenRouter's default model is free, and Gemini and Groq have free tiers.

## Environment file

A `.env` file is optional and gitignored. It is read only by the live provider tests:

```
OPENROUTER_API_KEY=...
GROQ_API_KEY=...
GEMINI_API_KEY=...
```

The app itself never reads `.env`; its key comes from Settings.

Run the live tests with:

```bash
OSO_LIVE=1 npx jest src/llm/__tests__/live.test.ts
```

They make real, billable calls and are skipped without `OSO_LIVE=1`.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start Metro |
| `npm run android` | Build and run on Android (`expo run:android`) |
| `npm run ios` | Build and run on iOS (`expo run:ios`) |
| `npm test` | Run unit tests |
| `npm run typecheck` | Type-check without emitting |
| `npx expo-doctor` | Diagnose dependency and config problems |
| `npx expo install --fix` | Align package versions with the Expo SDK |
| `scripts/dev-phone.sh` | Dev server plus phone connection, for WSL |
| `scripts/build-icons.sh` | Rebuild app icons from the reading panda |
| `scripts/build-mascots.sh <folder>` | Resize mascot masters |

## Manual test checklist

These cannot be covered by unit tests and need a real device:

- Reminders fire at the set times.
- Today's reminders are cancelled after completing a task.
- Reminders are rescheduled when the app is reopened.
- Reading, the streak and review all work in airplane mode.
- Closing the app mid-generation and reopening it resumes where it stopped.
- On Xiaomi, Tecno or Infinix phones, check that battery optimisation does not delay reminders.
