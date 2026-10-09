#!/usr/bin/env bash
# Builds the app icons from the reading panda master.
#   scripts/build-icons.sh [master.png]
# Master: square, transparent PNG of the reading panda (defaults to assets/mascot/reading@3x.png;
# pass a 960 px or larger master for a sharper result). See "App icon" in CLAUDE.md.
set -euo pipefail

root="$(dirname "$0")/.."
src="${1:-$root/assets/mascot/reading@3x.png}"
out="$root/assets"
light="0xF7F1E3"
dark="0x132122"

tile() { # <background colour> <output> — opaque, full-bleed; the OS masks the corners
  ffmpeg -v error -y -f lavfi -i "color=c=$1:s=1024x1024" -i "$src" \
    -filter_complex "[1]scale=1024:1024:flags=lanczos[p];[0][p]overlay=format=auto" \
    -frames:v 1 -pix_fmt rgb24 "$2"
}

tile "$light" "$out/icon.png"
tile "$dark" "$out/icon-dark.png"

# Android adaptive foreground: transparent, panda kept inside the centre 66% safe zone.
ffmpeg -v error -y -i "$src" \
  -vf "scale=800:800:flags=lanczos,pad=1024:1024:112:112:color=0x00000000" \
  -frames:v 1 -pix_fmt rgba "$out/android-icon-foreground.png"

ffmpeg -v error -y -i "$out/icon.png" -vf "scale=48:48:flags=lanczos" -frames:v 1 "$out/favicon.png"
echo "icon icon-dark android-icon-foreground favicon"
