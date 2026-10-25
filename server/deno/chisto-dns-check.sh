#!/bin/sh
# Раз в минуту (chisto-dns-check.timer): DNS отвечает и сам, и через туннель. Нет — перезапуск того, что упало.
Q=AAABAAABAAAAAAAAC2RvdWJsZWNsaWNrA25ldAAAAQAB   # doubleclick.net, тип A
ok() { curl -sf -m "$2" -o /dev/null -H 'accept: application/dns-message' "$1?dns=$Q"; }
if ! ok http://127.0.0.1:8053/dns-query 5 && ! ok http://127.0.0.1:8053/dns-query 5; then
  systemctl restart chisto-dns; exit 0
fi
if ! ok "${PUBLIC_URL:-https://chisto-dns.flownote.cc/dns-query}" 10 && ! ok "${PUBLIC_URL:-https://chisto-dns.flownote.cc/dns-query}" 10; then
  systemctl restart chisto-dns-tunnel
fi
