#!/usr/bin/env bash
# Run the development build on a USB-connected Android phone from WSL.
# Starts Metro, relays it over IPv4 (Windows adb forwards to 127.0.0.1, which
# cannot reach a WSL IPv6 listener), and re-applies the port forward and
# reopens the app every time the phone (re)connects.
#
# Usage: scripts/dev-phone.sh        (Ctrl+C to stop)
set -u
cd "$(dirname "$0")/.."

ADB=${ADB:-adb.exe}
PKG=com.femiayodeji.oso
APK=android/app/build/outputs/apk/debug/app-debug.apk
METRO_PORT=8081
RELAY_PORT=8082
URL="oso://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${METRO_PORT}"

listening() { ss -ltn 2>/dev/null | grep -q ":$1 "; }
adb() { timeout 20 "$ADB" "$@"; }

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null; }
trap cleanup EXIT

if ! listening "$RELAY_PORT"; then
  node -e '
    const net = require("net");
    net.createServer((c) => {
      const u = net.connect(Number(process.argv[1]), "127.0.0.1");
      c.pipe(u).pipe(c);
      c.on("error", () => u.destroy());
      u.on("error", () => c.destroy());
    }).listen(Number(process.argv[2]), "0.0.0.0");
  ' "$METRO_PORT" "$RELAY_PORT" &
  pids+=($!)
fi

forwarded() { adb reverse --list 2>/dev/null | grep -q "tcp:$METRO_PORT tcp:$RELAY_PORT"; }

# A reconnect can be shorter than one poll, so check the forward itself, not the connection.
watch_phone() {
  local waiting=0
  while true; do
    if [ "$(adb get-state 2>/dev/null | tr -d '\r')" != "device" ]; then
      [ "$waiting" = 0 ] && echo "[phone] waiting for the phone..."
      waiting=1
    elif ! forwarded; then
      waiting=0
      echo "[phone] connected"
      if ! adb shell pm list packages "$PKG" | grep -q "$PKG"; then
        if [ -f "$APK" ]; then
          echo "[phone] installing $APK"
          timeout 300 "$ADB" install -r "$(wslpath -w "$APK")" | tail -1
        else
          echo "[phone] app not installed and no APK; run: (cd android && ./gradlew app:assembleDebug)"
        fi
      fi
      if adb reverse "tcp:$METRO_PORT" "tcp:$RELAY_PORT" >/dev/null; then
        adb shell am start -a android.intent.action.VIEW -d "'$URL'" >/dev/null
        echo "[phone] port forwarded, app opened"
      fi
    fi
    sleep 3
  done
}

watch_phone &
pids+=($!)

if listening "$METRO_PORT"; then
  echo "[metro] already running on $METRO_PORT"
  wait
else
  npx expo start --dev-client --port "$METRO_PORT"
fi
