# Чеклист проверки руками

Отмечайте по порядку. Команды — из корня репозитория.

## Сервер
- [ ] `node scripts/check-doh.mjs` — всё с ✓:
  - `ad.doubleclick.net` → у нас `blocked`, у публичного DNS `resolves`;
  - `chisto-test-ad.invalid` (только в нашем custom.txt) → у нас `blocked`, у публичного `nxdomain`;
  - `example.com` и `cdnjs.cloudflare.com` (общий CDN из белого списка) → `resolves` везде.
- [ ] Cloudflare: `cd cloudflare && node test.mjs` — 5 тестов разбора DNS проходят.
- [ ] Сайт открывается, вверху зелёное «Фильтр жив».
- [ ] VPS: снаружи `curl -m 5 http://SERVER_IP:3000` — **не отвечает** (панель только через SSH-туннель).
- [ ] VPS: снаружи `dig @SERVER_IP example.com` — **не отвечает** (порт 53 не открыт).

## Журналы
- [ ] VPS: `grep -A2 '^querylog' server/data/conf/AdGuardHome.yaml` → `enabled: false`.
- [ ] VPS: откройте пару сайтов с телефона, затем `docker compose logs adguard | grep -i doubleclick` — пусто.
- [ ] Cloudflare: в `cloudflare/wrangler.jsonc` `observability.enabled: false`; в дашборде Worker → Logs пусто.

## iPhone
- [ ] Профиль ставится по шагам с сайта, в Настройки → Основные → VPN и управление устройством → DNS выбран «Чисто».
- [ ] Сайт с кнопками показывает «Фильтр жив»; в Safari `https://ad.doubleclick.net` не открывается.
- [ ] Профиль удаляется кнопкой «Удалить профиль»; после этого в «VPN и управление устройством» нет ни DNS, ни VPN; `ad.doubleclick.net` снова открывается.

## Расширение
- [ ] `cd site && python3 -m http.server 8080`, открыть `http://localhost:8080/fixtures/ad.html` без расширения → «ТЕСТ НЕ ПРОЙДЕН».
- [ ] Поставить `extension/dist/chrome` через «Загрузить распакованное», обновить страницу → «ТЕСТ ПРОЙДЕН» (8 галочек).
- [ ] В попапе «Выключить на этом сайте» → после перезагрузки снова «НЕ ПРОЙДЕН». Включить обратно.

## Репозиторий
- [ ] `scripts/audit-secrets.sh` → «Чисто: ключей, сертификатов и паролей в репозитории нет».
- [ ] `git status` не показывает `.env`, `server/.admin-password`, `server/data/`.
