# Тексты для App Store Connect

**Название:** Чисто — блокировка рекламы
**Подзаголовок:** Меньше рекламы и трекеров
**Категория:** Утилиты

**Описание:**
Чисто убирает рекламу и трекеры на iPhone и iPad.

• Защита для всего телефона: приложение настраивает зашифрованный DNS (DNS over HTTPS) на наш сервер. Рекламные и трекерные домены не открываются ни в браузерах, ни в приложениях.
• Блокировщик для Safari: прячет баннеры и не загружает рекламные скрипты.
• Включается одной кнопкой. Последний шаг — выбрать «Чисто» в Настройках → Основные → VPN и управление устройством → DNS.

Честно о границах: реклама в официальных приложениях YouTube, TikTok и Instagram идёт с тех же серверов, что и видео, — её Чисто не убирает.

Мы не собираем данные. На сервер уходит только DNS-запрос (имя сайта), чтобы на него ответить. Журнал запросов выключен. Трафик сайтов через сервер не идёт.

**Ключевые слова:** блокировка рекламы,адблок,трекеры,dns,safari,приватность,баннеры
**URL поддержки / политики:** https://DOH_HOST/ (раздел внизу страницы)

## App Privacy (анкета)
- Data Collection: **Data Not Collected**.
- Tracking: **No**.

## Export Compliance
- `ITSAppUsesNonExemptEncryption = NO` в Info.plist обоих таргетов.
- Ответ: приложение не содержит своего шифрования; HTTPS/DoH выполняет iOS.

## Заметка для ревьюера (App Review Notes)
The app saves a DNS-over-HTTPS configuration via NEDNSSettingsManager pointing to our resolver, which answers 0.0.0.0 for known ad/tracker domains. It does not use a VPN tunnel and does not see user traffic. To activate after tapping "Включить защиту": Settings → General → VPN & Device Management → DNS → Чисто. The Safari Content Blocker can be enabled in Settings → Apps → Safari → Extensions. All functionality is visible to the reviewer; there are no server-side switches.
