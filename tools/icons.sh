#!/usr/bin/env bash
# Иконки из знака site/favicon.svg (щит с огнём). Нужен ImageMagick (magick).
set -euo pipefail
cd "$(dirname "$0")/.."
SVG=site/favicon.svg
for s in 16 32 48 128; do
  magick -background none -density 800 "$SVG" -resize ${s}x${s} "extension/src/icons/$s.png"
done
# Сайт (apple-touch-icon) и iOS: без прозрачности, знак по центру на тёмно-синем.
magick -size 180x180 xc:'#0a1024' \( -background none -density 800 "$SVG" -resize 132x132 \) -gravity center -composite site/icon.png
magick -size 1024x1024 xc:'#0a1024' \( -background none -density 1600 "$SVG" -resize 700x700 \) -gravity center -composite -alpha off \
  ios-app/Chisto/Assets.xcassets/AppIcon.appiconset/icon-1024.png
echo "иконки готовы"
