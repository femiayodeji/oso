#!/usr/bin/env bash
# Resizes mascot masters into the @1x/@2x/@3x files the app loads.
#   scripts/build-mascots.sh <folder-of-masters>
# Masters: square, transparent PNGs named after the state (reading, noTopics, generating, chat,
# thinking, happy, completed, reminder, error) plus pandaIcon. See "Asset dimensions" in CLAUDE.md.
set -euo pipefail

src="${1:?usage: scripts/build-mascots.sh <folder-of-masters>}"
out="$(dirname "$0")/../assets/mascot"

resize() { # <input> <name> <base size in px>
  local suffix=("" "@2x" "@3x")
  for i in 0 1 2; do
    local px=$(( $3 * (i + 1) ))
    ffmpeg -v error -y -i "$1" -vf "scale=${px}:${px}:flags=lanczos" -pix_fmt rgba "$out/$2${suffix[$i]}.png"
  done
}

for state in reading noTopics generating chat thinking happy completed reminder error; do
  [ -f "$src/$state.png" ] && resize "$src/$state.png" "$state" 160 && echo "$state"
done
[ -f "$src/pandaIcon.png" ] && resize "$src/pandaIcon.png" pandaIcon 48 && echo pandaIcon
exit 0
