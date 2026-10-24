#!/usr/bin/env bash
# Делает профиль iOS/macOS «DNS через HTTPS» из .env.
# Профиль НЕ подписан: iOS честно покажет «Не подписан». Чужими сертификатами не подписываем.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

OUT=ios-profile/install.mobileconfig
ID="${PROFILE_ID:-com.example.chisto}"
NAME="${BRAND_NAME:-Чисто}"
# UUID держим постоянными, чтобы новая версия профиля заменяла старую, а не ставилась рядом.
UUID_FILE=ios-profile/.uuids
if [ ! -s "$UUID_FILE" ]; then
  printf '%s\n%s\n' "$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)" \
                    "$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)" > "$UUID_FILE"
fi
P_UUID=$(sed -n 1p "$UUID_FILE" | tr a-z A-Z)
D_UUID=$(sed -n 2p "$UUID_FILE" | tr a-z A-Z)

# IP нужен iOS, чтобы найти сервер без обычного DNS. У Cloudflare Worker IP плавают — тогда не указываем.
ADDR_XML=""
if [ -n "${SERVER_IP:-}" ]; then
  ADDR_XML="        <key>ServerAddresses</key>
        <array>
          <string>${SERVER_IP}</string>
        </array>
"
fi

cat > "$OUT" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://${DOH_HOST}${DOH_PATH}</string>
${ADDR_XML}      </dict>
      <key>PayloadDisplayName</key>
      <string>${NAME}: DNS через HTTPS</string>
      <key>PayloadDescription</key>
      <string>Направляет DNS-запросы на ${DOH_HOST}, где отсекаются рекламные и трекерные домены. Трафик сайтов через сервер не идёт.</string>
      <key>PayloadIdentifier</key>
      <string>${ID}.dns</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>${D_UUID}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>${NAME} — блокировка рекламы через DNS</string>
  <key>PayloadDescription</key>
  <string>Удалить: Настройки → Основные → VPN и управление устройством → профиль → Удалить.</string>
  <key>PayloadIdentifier</key>
  <string>${ID}</string>
  <key>PayloadOrganization</key>
  <string>${NAME}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${P_UUID}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
XML
mkdir -p site/dl
cp "$OUT" site/dl/chisto.mobileconfig
command -v plutil >/dev/null && plutil -lint "$OUT" >/dev/null && echo "Профиль iOS: $OUT (проверен plutil)" || echo "Профиль iOS: $OUT"
