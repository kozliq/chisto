# Бесплатный сервер на Cloudflare Workers

Worker делает две вещи: отдаёт сайт с кнопками (`../site`) и работает DoH-фильтром на `/dns-query`.
VPS и карта не нужны — хватает бесплатного аккаунта Cloudflare.

## Как работает
1. Запрос DoH (GET `?dns=` или POST) → разбираем имя.
2. Домен (или его родитель) в списке → ответ `0.0.0.0` / `::`.
3. Иначе → пересылаем в `cloudflare-dns.com` (запасной — `dns.google`).
4. В ответе есть CNAME на трекер (CNAME-маскировка) → тоже `0.0.0.0`.

Список — `src/blocklist.json` (~220 000 доменов: AdGuard DNS filter + StevenBlack + custom.txt,
без общих CDN из `filters/shared-cdn.txt`). Собирается `node tools/build.mjs`, вшивается в Worker при деплое (~1,7 МБ gzip, лимит бесплатного тарифа — 3 МБ).

## Запуск
    scripts/setup-cloudflare.sh          # из корня: правила, профиль iOS, сайт
    cd cloudflare && npx wrangler deploy # первый раз попросит войти в Cloudflare
После первого деплоя впишите выданный адрес (`chisto-dns.<аккаунт>.workers.dev`) в `.env` → `DOH_HOST`
и повторите обе команды (профиль iOS и сайт должны знать свой адрес).

## Проверка
    node test.mjs                        # разбор DNS без сети
    npx wrangler dev                     # локально: http://127.0.0.1:8787
    node ../scripts/check-doh.mjs --url http://127.0.0.1:8787/dns-query

## Ограничения
- Нет DoT (порт 853) → «Частный DNS» на Android не работает, на сайте этот способ скрыт.
- Бесплатно 100 000 запросов в сутки — примерно 10–20 активных телефонов.
- Свежие списки — после пересборки и деплоя (раз в неделю достаточно).
