#!/bin/sh
# Картинки для README и статьи: .github/assets/src/*.html → .github/assets/*.png (headless Chrome, @2x).
set -e
cd "$(dirname "$0")/../.github/assets"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() { # имя ширина высота
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --disable-web-security --user-data-dir="${TMPDIR:-/tmp}/chisto-shots" \
    --force-device-scale-factor=2 --window-size="$2,$3" --virtual-time-budget=4000 \
    --screenshot="$PWD/$1.png" "file://$PWD/src/$1.html" 2>/dev/null
}
shot banner 1280 440
shot how 1280 450
shot free 1280 250
shot bot 440 480
shot install 1280 760
shot arch 1280 520
ls -la *.png
