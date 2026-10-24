#!/usr/bin/env bash
# Проверка: в репозитории нет сертификатов, приватных ключей, provisioning profile и паролей.
cd "$(dirname "$0")/.."
bad=0
files=$(find . -type f \( -name '*.p12' -o -name '*.pfx' -o -name '*.pem' -o -name '*.key' -o -name '*.crt' \
  -o -name '*.cer' -o -name '*.mobileprovision' -o -name '*.provisionprofile' -o -name '*.jks' -o -name '*.keystore' \) \
  -not -path './server/data/*' -not -path '*/node_modules/*' -not -path '*/.gradle/*' -not -path '*/build/*')
[ -n "$files" ] && { echo "Найдены файлы ключей/сертификатов:"; echo "$files"; bad=1; }
hits=$(grep -rIl --exclude-dir={data,node_modules,.gradle,build,dist,upstream} --exclude=audit-secrets.sh \
  -e 'BEGIN [A-Z ]*PRIVATE KEY' -e 'BEGIN CERTIFICATE' . 2>/dev/null)
[ -n "$hits" ] && { echo "Найдены ключи/сертификаты внутри файлов:"; echo "$hits"; bad=1; }
# Team ID владельца должен жить только в ios-app/Config/Team.xcconfig (в .gitignore).
team=$(grep -rIlE --include='*.pbxproj' --include='Base.xcconfig' '^[[:space:]]*DEVELOPMENT_TEAM = [A-Z0-9]{10}' ios-app 2>/dev/null)
[ -n "$team" ] && { echo "Team ID в файлах репозитория:"; echo "$team"; bad=1; }
grep -q '^\.env$' .gitignore || { echo ".env не в .gitignore"; bad=1; }
grep -q 'admin-password' .gitignore || { echo "server/.admin-password не в .gitignore"; bad=1; }
grep -rIn --include='*.yaml' --include='*.yml' -E 'password: [^_$ ]' server/AdGuardHome.yaml server/docker-compose.yml && { echo "Пароль в шаблоне"; bad=1; }
[ $bad = 0 ] && echo "Чисто: ключей, сертификатов и паролей в репозитории нет."
exit $bad
