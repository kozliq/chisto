# Роутер: один раз — и в этой сети ставить ничего не надо

Работает только в **своей** сети. В гостях и в мобильном интернете телефон ходит мимо роутера —
там нужен профиль/приложение.

Адреса берите с сайта (раздел «Роутер»): DoH — `https://DOH_HOST/dns-query`, DoT — `DOH_HOST:853` (только VPS).

| Роутер | Где |
|---|---|
| Keenetic | Сетевые правила → Интернет-фильтры → Настройка DNS → «DNS-over-HTTPS» (или «DNS-over-TLS»). Нужен компонент «Прокси-сервер DNS-over-TLS/HTTPS» |
| MikroTik (RouterOS 7) | IP → DNS → Use DoH Server: адрес DoH, Verify DoH Cert ✓. Сертификаты: `/certificate/settings/set builtin-trust-anchors=trusted` |
| OpenWrt | Пакет `https-dns-proxy` → LuCI → Services → HTTPS DNS Proxy → свой адрес |
| ASUS с Asuswrt-Merlin | WAN → DNS Privacy Protocol: DNS-over-TLS, сервер `DOH_HOST`, порт 853 |
| Другие | Ищите «DoH», «DoT», «Частный DNS». Если нет — см. ниже |

После настройки отключите «DNS от провайдера» и проверьте с любого устройства в сети: `ad.doubleclick.net` не открывается.

## Старый роутер без DoH/DoT
Ему нужен обычный DNS на порт 53. Открывать 53 всему интернету нельзя (открытый резолвер используют для DDoS).
Только VPS и только для своего IP: в `server/docker-compose.yml` пробросьте `"53:53/udp"` и закройте его фаерволом:
`ufw allow from ВАШ_ДОМАШНИЙ_IP to any port 53 proto udp`. Если домашний IP меняется — такой режим не подойдёт.
