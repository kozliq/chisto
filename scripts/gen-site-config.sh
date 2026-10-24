#!/usr/bin/env bash
# site/config.js из .env — сайт берёт оттуда адрес сервера и ссылки на магазины.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
js() { printf '"%s"' "$(printf '%s' "${1:-}" | sed 's/[\\"]/\\&/g')"; }
cat > site/config.js <<JS
// Сгенерировано scripts/gen-site-config.sh из .env. Не править руками.
window.CHISTO = {
  brand: $(js "${BRAND_NAME:-Чисто}"),
  dohHost: $(js "$DOH_HOST"),
  dohPath: $(js "${DOH_PATH:-/dns-query}"),
  serverIp: $(js "${SERVER_IP:-}"),
  chromeStoreUrl: $(js "${CHROME_STORE_URL:-}"),
  firefoxAmoUrl: $(js "${FIREFOX_AMO_URL:-}"),
  iosAppUrl: $(js "${IOS_APP_URL:-}"),
  tgBot: $(js "${TG_BOT:-}"),
  hasDot: ${HAS_DOT:-true},
  apkReady: $([ -f site/dl/chisto.apk ] && echo true || echo false)
};
JS
echo "Сайт: site/config.js"
