#!/usr/bin/env bash
# Готовит всё к `docker compose up -d`: пароль панели, конфиг AdGuard Home,
# правила, профиль iOS, конфиг сайта, архивы расширения.
# Повторный запуск безопасен. --force пересоздаёт конфиг AdGuard Home (настройки из панели пропадут).
set -euo pipefail
cd "$(dirname "$0")/.."

FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создал .env из .env.example. Впишите DOH_HOST, SERVER_IP, ACME_EMAIL и запустите ещё раз."
  exit 1
fi
set -a; . ./.env; set +a

for v in DOH_HOST DOH_PATH SERVER_IP ADMIN_USER; do
  [ -n "${!v:-}" ] || { echo "В .env пусто: $v" >&2; exit 1; }
done
if [ "$DOH_HOST" = "dns.example.com" ]; then
  echo "DOH_HOST всё ещё dns.example.com — впишите своё имя в .env" >&2; exit 1
fi
case "$DOH_PATH" in /*) ;; *) echo "DOH_PATH должен начинаться с /" >&2; exit 1;; esac

# 1. Пароль панели: генерируем один раз, храним только у владельца.
PASS_FILE=server/.admin-password
if [ ! -s "$PASS_FILE" ]; then
  umask 077
  # Без пайпа в head: при pipefail обрыв трубы молча ронял бы скрипт.
  PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 400 /dev/urandom))
  printf '%s' "${PASS:0:24}" > "$PASS_FILE"
  unset PASS
  echo "Пароль панели записан в $PASS_FILE (в чат и в git его не кладите)."
fi

bcrypt() {
  if command -v htpasswd >/dev/null; then
    htpasswd -niBC 10 "$ADMIN_USER" < "$PASS_FILE" | cut -d: -f2-
  elif command -v docker >/dev/null; then
    docker run --rm -i httpd:2.4.62-alpine htpasswd -niBC 10 "$ADMIN_USER" < "$PASS_FILE" | cut -d: -f2-
  else
    echo "Нужен htpasswd (apt install apache2-utils) или docker" >&2; exit 1
  fi
}

# 2. Конфиг AdGuard Home из шаблона.
CONF=server/data/conf/AdGuardHome.yaml
mkdir -p server/data/conf server/data/work
if [ ! -f "$CONF" ] || [ $FORCE = 1 ]; then
  HASH=$(bcrypt | tr -d '\r\n')
  sed -e "s|__ADMIN_USER__|${ADMIN_USER}|g" \
      -e "s|__ADMIN_HASH__|${HASH}|g" \
      -e "s|__DOH_HOST__|${DOH_HOST}|g" \
      -e "s|__CERT_ISSUER_DIR__|${CERT_ISSUER_DIR:-acme-v02.api.letsencrypt.org-directory}|g" \
      server/AdGuardHome.yaml > "$CONF"
  chmod 600 "$CONF"
  echo "Конфиг AdGuard Home: $CONF"
else
  echo "Конфиг AdGuard Home уже есть, не трогаю (пересоздать: setup.sh --force)."
fi

# 3. Правила: DNS-список, правила расширения и Safari, архивы расширения.
run_node() {
  if command -v node >/dev/null; then node "$@"
  else docker run --rm -v "$PWD":/w -w /w node:22.11.0-alpine node "$@"; fi
}
run_node tools/build.mjs

# 4. Профиль iOS и конфиг сайта.
scripts/gen-mobileconfig.sh
scripts/gen-site-config.sh

cat <<MSG

Готово. Дальше:
  cd server && docker compose up -d
Проверка:  node scripts/check-doh.mjs
Панель:    ssh -L 3000:127.0.0.1:3000 <сервер>  ->  http://127.0.0.1:3000  (логин ${ADMIN_USER})
MSG
