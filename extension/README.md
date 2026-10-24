# Расширение «Чисто» (Manifest V3)

Chrome, Edge, Яндекс Браузер, Opera, Brave (≥ Chromium 121) и Firefox (≥ 128).

- Сеть — `declarativeNetRequest`: правила из custom.txt + EasyList, RU AdList, EasyPrivacy.
  30 000 встроенных + до 29 000 динамических, которые приходят с сервера (`/rules/update.json`, раз в 12 ч).
- Косметика — CSS через `scripting.insertCSS` (origin USER, сайт не видит и не перебивает).
- Попап: «выключить на этом сайте», «пауза везде».
- Нет скриптлетов и удалённого кода: с сервера приходят только данные (правила).

## Сборка
    node tools/build.mjs        # из корня репозитория
Результат: `extension/dist/chrome`, `extension/dist/firefox`, архивы `site/dl/chisto-*.zip`.

## Поставить себе (Chrome и похожие)
1. Распакуйте `chisto-chrome.zip` в постоянную папку.
2. `chrome://extensions` → «Режим разработчика».
3. «Загрузить распакованное» → эта папка.

## Публикация
- Chrome Web Store: разовый взнос разработчика $5, загрузить `chisto-chrome.zip`. Описание — честное, как в manifest.
- Firefox AMO: бесплатно, загрузить `chisto-firefox.zip`. Свой `gecko.id` в `tools/build.mjs`.
После публикации впишите ссылки в `.env` (`CHROME_STORE_URL`, `FIREFOX_AMO_URL`) — кнопка на сайте поведёт в магазин.

## Проверено
Тестовая страница `site/fixtures/ad.html`: без расширения «ТЕСТ НЕ ПРОЙДЕН», с расширением — «ТЕСТ ПРОЙДЕН»
(проверено в Brave headless с распакованным расширением).
