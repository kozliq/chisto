#!/usr/bin/env bash
# Бесплатный вариант без VPS: всё на Cloudflare Workers (сайт + DoH-фильтр).
# Готовит правила, профиль iOS и сайт. Деплой — отдельной командой (уходит в интернет):
#   cd cloudflare && npx wrangler deploy
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i.bak -e 's|^DOH_HOST=.*|DOH_HOST=chisto-dns.ВАШ-АККАУНТ.workers.dev|' -e 's|^SERVER_IP=.*|SERVER_IP=|' .env && rm -f .env.bak
  echo "Создал .env. Впишите DOH_HOST (адрес Worker после первого деплоя) и запустите ещё раз."
  exit 1
fi
set -a; . ./.env; set +a
[ "${DOH_HOST:-}" != "dns.example.com" ] && [ -n "${DOH_HOST:-}" ] || { echo "Впишите DOH_HOST в .env" >&2; exit 1; }

node tools/build.mjs
scripts/gen-mobileconfig.sh
HAS_DOT=false scripts/gen-site-config.sh
# Путь DoH в Worker — из того же .env.
sed -i.bak "s|\"DOH_PATH\": \"[^\"]*\"|\"DOH_PATH\": \"${DOH_PATH:-/dns-query}\"|" cloudflare/wrangler.jsonc && rm -f cloudflare/wrangler.jsonc.bak
du -h cloudflare/src/blocklist.json | awk '{print "Список доменов для Worker: " $1}'
echo
echo "Готово. Деплой: cd cloudflare && npx wrangler deploy"
echo "Проверка после деплоя: node scripts/check-doh.mjs"
