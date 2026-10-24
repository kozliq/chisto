# iOS-приложение «Чисто»

Честное приложение: **DNS Settings** (`NEDNSSettingsManager`), не VPN.
- Одна кнопка «Включить защиту» → iOS сохраняет настройку DoH на наш сервер.
- Последний шаг пользователь делает сам: Настройки → Основные → VPN и управление устройством → DNS → «Чисто». Обойти это нельзя и не нужно.
- Второй таргет — **Safari Content Blocker**: правила из `filters/custom.txt` + сетевые правила EasyList/RU AdList/EasyPrivacy, до 50 000.
- Прямо на экране: «YouTube, TikTok и Instagram этим приложением не чинятся».

## Что нужно
- Mac + Xcode 16 или новее (проект в формате папок Xcode 16).
- Для запуска на телефоне и публикации — Apple Developer Program, $99/год.
  Без него собирается только под симулятор, а DNS Settings на симуляторе не работает.

## Открыть и собрать
    scripts/gen-ios-config.sh          # из корня: адрес сервера и bundle id из .env
    node tools/build.mjs               # правила для Safari → ContentBlocker/blockerList.json
    open ios-app/Chisto.xcodeproj

Свой Team ID — в `ios-app/Config/Team.xcconfig` (в git не попадает):

    DEVELOPMENT_TEAM = ABCDE12345

Проверка сборки без подписи (так проверено и у нас):

    xcodebuild -project ios-app/Chisto.xcodeproj -scheme Chisto -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build

## Права (entitlements)
Только `com.apple.developer.networking.networkextension = [dns-settings]`.
В Certificates, Identifiers & Profiles у App ID включите **Network Extensions**. Ничего больше.

## Публикация
1. App Store Connect → новое приложение, bundle id = `PROFILE_ID` из `.env`.
2. Product → Archive → Distribute → App Store Connect.
3. TestFlight: внутренние тестеры (до 100) — сразу; внешние (до 10 000) и публичная ссылка — после Beta App Review. Сборка живёт 90 дней.
4. Постоянный канал для обычных людей — App Store. Тексты — `AppStore.md`.

Нельзя: чужие сертификаты и профили, корпоративная подпись, AltStore/TrollStore, скрытие функций на время ревью.
