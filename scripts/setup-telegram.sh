#!/usr/bin/env bash
# Подключает Telegram-бота к Worker (после первого деплоя).
# Нужен токен от @BotFather в файле cloudflare/.tg-token (файл в .gitignore, в чат не копировать).
# Токен нигде не печатается.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
TOKEN_FILE=cloudflare/.tg-token
[ -s "$TOKEN_FILE" ] || { echo "Положите токен бота в $TOKEN_FILE (одна строка) и запустите снова." >&2; exit 1; }
TOKEN=$(tr -d ' \r\n' < "$TOKEN_FILE")
SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 400 /dev/urandom)); SECRET=${SECRET:0:48}
WRANGLER=${WRANGLER:-npx --yes wrangler@4.149.0}

cd cloudflare
printf '%s' "$TOKEN" | $WRANGLER secret put TG_TOKEN >/dev/null
printf '%s' "$SECRET" | $WRANGLER secret put TG_SECRET >/dev/null
cd ..

api() { curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/$1" -H 'content-type: application/json' -d "$2"; echo; }
api setWebhook "{\"url\":\"https://${DOH_HOST}/tg\",\"secret_token\":\"${SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\",\"inline_query\",\"pre_checkout_query\"],\"drop_pending_updates\":true}"
api setMyCommands '{"commands":[{"command":"start","description":"Как поставить"},{"command":"ios","description":"iPhone и iPad"},{"command":"android","description":"Android"},{"command":"desktop","description":"Компьютер"},{"command":"router","description":"Роутер"},{"command":"ext","description":"Прислать расширение файлом"},{"command":"donate","description":"Сказать спасибо звёздочкой"}]}'
api setMyShortDescription '{"short_description":"Убирает рекламу и трекеры. Бесплатно, без регистрации."}'
api setMyDescription "{\"description\":\"Чисто — блокировка рекламы и трекеров для iPhone, Android, компьютера и роутера. Нажмите «Старт» и выберите устройство. Сайт: https://${DOH_HOST}/\"}"
unset TOKEN SECRET
echo "Бот подключён. В @BotFather включите inline-режим: /setinline → бот → подсказка «поделиться Чисто»."
