#!/usr/bin/env bash
# Адрес сервера и bundle id для iOS-приложения из .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
esc() { printf '%s' "${1:-}" | sed 's/[\\"]/\\&/g'; }
cat > ios-app/Chisto/ServerConfig.swift <<SWIFT
// Сгенерировано scripts/gen-ios-config.sh из .env. Не править руками.
import Foundation

enum ServerConfig {
    static let brand = "$(esc "${BRAND_NAME:-Чисто}")"
    static let dohHost = "$(esc "$DOH_HOST")"
    static let dohPath = "$(esc "${DOH_PATH:-/dns-query}")"
    static let serverIP = "$(esc "${SERVER_IP:-}")"
    static var dohURL: String { "https://\(dohHost)\(dohPath)" }
}
SWIFT
sed -i.bak "s|^BUNDLE_ID = .*|BUNDLE_ID = ${PROFILE_ID:-com.example.chisto}|" ios-app/Config/Base.xcconfig && rm -f ios-app/Config/Base.xcconfig.bak
echo "iOS: ios-app/Chisto/ServerConfig.swift, ios-app/Config/Base.xcconfig"
