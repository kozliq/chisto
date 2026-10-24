// Telegram-бот «Чисто»: по /start даёт кнопки установки, присылает файлы расширения,
// умеет делиться ссылкой в любом чате (@бот в строке сообщения).
// Ничего не хранит: ни пользователей, ни сообщений. Webhook защищён секретом.

const DEVICES = [
  { id: 'ios', label: 'iPhone и iPad', hash: '#ios' },
  { id: 'android', label: 'Android', hash: '#android' },
  { id: 'desktop', label: 'Компьютер', hash: '#desktop' },
  { id: 'router', label: 'Роутер', hash: '#router' },
];

const HINTS = {
  ios: '4 касания и код-пароль. Открывайте ссылку в Safari — из других браузеров iOS профиль не ставит.',
  android: 'В Chrome: Настройки → Конфиденциальность → Безопасный DNS → «Свой» → вставить адрес со страницы.',
  desktop: 'Расширение для Chrome, Edge, Яндекс Браузера и Firefox. Могу прислать файл прямо сюда.',
  router: 'Один раз на роутере — и в домашней сети ставить ничего не надо.',
};

export function intro(site) {
  return {
    text: 'Чисто убирает рекламу и трекеры. Бесплатно, без регистрации.\n\n' +
      'Выберите устройство — откроется страница с одной кнопкой.\n' +
      'Официальные YouTube, TikTok и Instagram не чинятся — честно.',
    reply_markup: {
      inline_keyboard: [
        DEVICES.slice(0, 2).map(d => ({ text: d.label, url: site + d.hash })),
        DEVICES.slice(2).map(d => ({ text: d.label, url: site + d.hash })),
        [{ text: 'Прислать расширение файлом', callback_data: 'ext' }],
        [{ text: 'Поделиться с другом', switch_inline_query: '' }],
      ],
    },
  };
}

/** Что ответить на апдейт. Возвращает список вызовов Bot API: [{ method, body }]. */
export function handleUpdate(update, site) {
  const out = [];
  const msg = update.message;
  if (msg?.chat && typeof msg.text === 'string') {
    const cmd = msg.text.trim().split(/[\s@]/)[0].slice(1);
    const device = DEVICES.find(d => d.id === cmd);
    if (device) {
      out.push({ method: 'sendMessage', body: {
        chat_id: msg.chat.id, text: `${device.label}: ${HINTS[device.id]}`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть инструкцию', url: site + device.hash }]] },
      } });
    } else if (cmd === 'ext') {
      out.push(...extensionFiles(msg.chat.id, site));
    } else {
      out.push({ method: 'sendMessage', body: { chat_id: msg.chat.id, ...intro(site) } });
    }
  }
  const cb = update.callback_query;
  if (cb) {
    out.push({ method: 'answerCallbackQuery', body: { callback_query_id: cb.id } });
    if (cb.data === 'ext' && cb.message?.chat) out.push(...extensionFiles(cb.message.chat.id, site));
  }
  const iq = update.inline_query;
  if (iq) {
    out.push({ method: 'answerInlineQuery', body: {
      inline_query_id: iq.id, cache_time: 3600, is_personal: false,
      results: [{
        type: 'article', id: 'chisto',
        title: 'Чисто — убрать рекламу',
        description: 'Бесплатно, без регистрации. iPhone, Android, компьютер.',
        input_message_content: { message_text: `Убирает рекламу и трекеры, бесплатно и без регистрации: ${site}` },
        reply_markup: { inline_keyboard: [[{ text: 'Поставить', url: site }]] },
      }],
    } });
  }
  return out;
}

function extensionFiles(chatId, site) {
  return [
    { method: 'sendDocument', body: { chat_id: chatId, document: `${site}dl/chisto-chrome.zip`,
      caption: 'Chrome, Edge, Яндекс Браузер, Opera, Brave.\n1) Распакуйте в постоянную папку\n2) chrome://extensions → «Режим разработчика»\n3) «Загрузить распакованное» → эта папка' } },
    { method: 'sendDocument', body: { chat_id: chatId, document: `${site}dl/chisto-firefox.zip`,
      caption: 'Firefox: about:debugging → «Загрузить временное дополнение» → этот файл (до перезапуска).' } },
  ];
}

export async function botRequest(request, env, site) {
  // Секрет из setWebhook: чужие POST на этот адрес отбрасываем.
  if (!env.TG_TOKEN || request.headers.get('x-telegram-bot-api-secret-token') !== env.TG_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (!update) return new Response('bad', { status: 400 });
  for (const call of handleUpdate(update, site)) {
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${call.method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call.body),
    }).catch(() => {});
  }
  return new Response('ok');
}
