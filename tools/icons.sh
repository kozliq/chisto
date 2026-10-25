#!/usr/bin/env bash
# Иконки из герба brand/kit/crest-2048.png (мангуст против кобры). Нужен ImageMagick (magick).
# Щит вырезается из квадрата 2048 по рамке, фон вокруг щита — прозрачный там, где нужно.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=brand/kit/crest-2048.png
TMP=$(mktemp -d); trap 'rm -r "$TMP"' EXIT
# Щит на прозрачном фоне: убираем фон страницы #1c1a1b вокруг рамки и обрезаем по краю.
magick "$SRC" -fuzz 8% -fill none -draw "color 0,0 floodfill" -trim +repage "$TMP/shield.png"
magick "$TMP/shield.png" -background none -gravity center -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" "$TMP/sq.png" 2>/dev/null \
  || magick "$TMP/shield.png" -background none -gravity center -extent 1600x1600 "$TMP/sq.png"
for s in 16 32 48 128; do magick "$TMP/sq.png" -resize ${s}x${s} "extension/src/icons/$s.png"; done
magick "$TMP/sq.png" -resize 64x64 site/favicon.png
magick "$TMP/shield.png" -resize 600x -quality 86 site/crest.webp
magick "$TMP/shield.png" -resize 160x -quality 86 site/crest-sm.webp
magick -size 180x180 xc:'#1c1a1b' \( "$TMP/sq.png" -resize 150x150 \) -gravity center -composite site/icon.png
magick -size 1024x1024 xc:'#1c1a1b' \( "$TMP/sq.png" -resize 820x820 \) -gravity center -composite -alpha off \
  ios-app/Chisto/Assets.xcassets/AppIcon.appiconset/icon-1024.png
echo "иконки готовы"
