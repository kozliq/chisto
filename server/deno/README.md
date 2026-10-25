# DNS «Чисто» на своём сервере без Docker

Тот же код, что в Cloudflare Worker (`cloudflare/src`), запускается под Deno. Нужен, когда телефонов больше,
чем выдерживает бесплатный лимит Workers (100 000 запросов в сутки на аккаунт).

1. Установите Deno и cloudflared.
2. Скопируйте `cloudflare/src/*.js` и `blocklist.json` в `/opt/chisto-dns/`.
3. `cloudflared tunnel create chisto-dns` и `cloudflared tunnel route dns chisto-dns dns.example.com`;
   файл ключа туннеля — в `/etc/cloudflared/`, конфиг — из `chisto-dns.yml.example`.
4. Службы: `chisto-dns.service` и `chisto-dns-tunnel.service` в `/etc/systemd/system/`,
   затем `systemctl enable --now chisto-dns chisto-dns-tunnel`.

DoT для Android «Частный DNS» — `cloudflare/src/dot.js` и `chisto-dot.service`: слушает порт 853 напрямую (туннель Cloudflare его не пропускает), сертификат Let's Encrypt (`certbot certonly --standalone`), после продления — перезапуск службы.

Сервер слушает только 127.0.0.1:8053, наружу смотрит туннель — входящие порты не нужны.
Лимит на адрес — `LIMIT_PER_MIN` (по умолчанию 120 в минуту), журналы выключены (`StandardOutput=null`).
