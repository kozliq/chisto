#!/bin/sh
# Ждёт сертификат, который выпускает Caddy, запускает AdGuard Home
# и перезапускает его, когда Caddy продлил сертификат (DoT читает файл только на старте).
CERT="/caddy-data/caddy/certificates/${CERT_ISSUER_DIR}/${DOH_HOST}/${DOH_HOST}.crt"
KEY="/caddy-data/caddy/certificates/${CERT_ISSUER_DIR}/${DOH_HOST}/${DOH_HOST}.key"
AGH="/opt/adguardhome/AdGuardHome --no-check-update -c /opt/adguardhome/conf/AdGuardHome.yaml -w /opt/adguardhome/work"

if [ ! -f /opt/adguardhome/conf/AdGuardHome.yaml ]; then
  echo "Нет conf/AdGuardHome.yaml. Сначала запустите scripts/setup.sh" >&2
  exit 1
fi

i=0
while [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; do
  [ $((i % 12)) -eq 0 ] && echo "Жду сертификат от Caddy: $CERT"
  i=$((i + 1))
  sleep 5
done

pid=""
trap '[ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null; wait "$pid"; exit 0' TERM INT

while true; do
  stamp=$(stat -c %Y "$CERT")
  $AGH &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep 3600 &
    wait $!
    if [ "$(stat -c %Y "$CERT")" != "$stamp" ]; then
      echo "Сертификат обновлён, перезапускаю AdGuard Home"
      kill -TERM "$pid"; wait "$pid"
      break
    fi
  done
  # Если AdGuard Home упал сам — пауза, чтобы не крутиться в цикле.
  kill -0 "$pid" 2>/dev/null || sleep 5
done
