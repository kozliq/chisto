# Android-приложение «Чисто»

Одна кнопка «Включить защиту». Два режима:

1. **Локальный VPN только для DNS** (по умолчанию). В туннель идёт один адрес — фальшивый DNS 10.111.222.1.
   Домен из встроенного списка (`filters/build/dns.txt`) → сразу `0.0.0.0`, остальное → DoH на наш сервер.
   Остальной трафик идёт мимо туннеля, ничего не записывается.
2. **Частный DNS** (Android 9+, только сервер с DoT). Кнопка копирует адрес и открывает настройки —
   включает пользователь сам. Если владелец телефона выдал права через adb, кнопка включает сама:

       adb shell pm grant com.example.chisto android.permission.WRITE_SECURE_SETTINGS

Нет: device admin, accessibility, обхода Play Protect, сбора данных. Зависимостей — ноль.

## Сборка debug APK
Нужны JDK 17 и Android SDK (проще всего — Android Studio).

    node ../tools/build.mjs --dns-only   # список доменов для приложения
    gradle wrapper --gradle-version 8.11.1   # один раз, если нет gradle/wrapper/gradle-wrapper.jar
    ./gradlew assembleDebug
    cp app/build/outputs/apk/debug/app-debug.apk ../site/dl/chisto.apk
    ../scripts/gen-site-config.sh        # сайт покажет кнопку APK

Адрес сервера и applicationId берутся из `../.env` (`DOH_HOST`, `DOH_PATH`, `PROFILE_ID`).

## Google Play (если владелец публикует сам)
- Аккаунт разработчика Google Play — разовый взнос $25.
- Release-сборка подписывается **своим** ключом (не в репозитории): `./gradlew bundleRelease`.
- В Play Console: категория «Инструменты», декларация VpnService — «блокировка рекламы/трекеров на устройстве, трафик не уходит со устройства, кроме DNS-запросов на наш DoH».
- Политика конфиденциальности — текст из `docs/PRIVACY.md` на сайте.
- Для Play уберите `WRITE_SECURE_SETTINGS` из манифеста, если ревью попросит.
