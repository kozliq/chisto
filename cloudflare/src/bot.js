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

// Звёзды Telegram: только по команде /donate, бот сам никогда не просит.
const STARS = [10, 50, 100, 500];
const DONATE_TEXT = 'Чисто бесплатное и таким останется: без рекламы, подписок и платных функций.\n\n' +
  'Если пригодилось и хочется сказать спасибо — кинь звёздочку. Это добровольно и ни на что не влияет.';
const PAYSUPPORT_TEXT = 'Звёзды здесь — просто спасибо, за них ничего не покупается. ' +
  'Отправил по ошибке или передумал — напиши автору: https://t.me/goatlerr, вернём.';

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
export function handleUpdate(update, site, botName = '') {
  const out = [];
  const msg = update.message;
  // В личке отвечаем на всё; в группах — только на свои команды, чтобы не мешать людям.
  const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
  const group = msg?.chat?.type && msg.chat.type !== 'private';
  if (msg?.chat && text && !msg.successful_payment) {
    const isCmd = text.startsWith('/');
    const [rawCmd, target] = isCmd ? text.split(/\s/)[0].slice(1).split('@') : [''];
    const cmd = rawCmd.toLowerCase();
    const known = cmd === 'start' || cmd === 'help' || cmd === 'donate' || cmd === 'paysupport' || cmd === 'ext' ||
      DEVICES.some(d => d.id === cmd);
    const ours = !target || !botName || target.toLowerCase() === botName.toLowerCase();
    if (group && (!isCmd || !known || !ours)) return out;
    const device = DEVICES.find(d => d.id === cmd);
    if (device) {
      out.push({ method: 'sendMessage', body: {
        chat_id: msg.chat.id, text: `${device.label}: ${HINTS[device.id]}`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть инструкцию', url: site + device.hash }]] },
      } });
    } else if (cmd === 'donate') {
      out.push({ method: 'donate', body: { chat_id: msg.chat.id } });
    } else if (cmd === 'paysupport') {
      out.push({ method: 'sendMessage', body: { chat_id: msg.chat.id, text: PAYSUPPORT_TEXT } });
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
  const pc = update.pre_checkout_query;
  if (pc) {
    const n = Number(/^thanks:(\d+)$/.exec(String(pc.invoice_payload || ''))?.[1]);
    const ok = pc.currency === 'XTR' && STARS.includes(n) && pc.total_amount === n;
    out.push({ method: 'answerPreCheckoutQuery', body: { pre_checkout_query_id: pc.id, ok,
      ...(ok ? {} : { error_message: 'Этот платёж не от Чисто.' }) } });
  }
  if (msg?.chat && msg.successful_payment?.currency === 'XTR') {
    out.push({ method: 'sendMessage', body: { chat_id: msg.chat.id, text: 'Спасибо! ❤️ Звёздочка долетела, автору приятно.' } });
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
  // Всегда отвечаем 200: иначе Telegram будет слать тот же апдейт снова и снова.
  try {
    const update = await request.json().catch(() => null);
    if (!update || typeof update !== 'object') return new Response('ok');
    for (const call of handleUpdate(update, site, env.TG_BOT)) {
      if (call.method === 'donate') { await sendDonate(call.body.chat_id, env.TG_TOKEN); continue; }
      await tgCall(env.TG_TOKEN, call.method, call.body);
    }
  } catch {
    // кривой апдейт не должен ронять вебхук
  }
  return new Response('ok');
}

async function tgCall(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => null);
  return r?.ok ? r.result : null;
}

// Ссылки на оплату одинаковые для всех — создаём один раз на жизнь изолята, а не на каждый /donate.
let donateLinks = null;

/** Кнопки «⭐ 10 / 50 / 100 / 500»: каждая открывает оплату звёздами. */
async function sendDonate(chatId, token) {
  if (!donateLinks) {
    const links = await Promise.all(STARS.map(n => tgCall(token, 'createInvoiceLink', {
      title: 'Спасибо Чисто', payload: `thanks:${n}`, currency: 'XTR', prices: [{ label: 'Спасибо', amount: n }],
      description: 'Добровольное спасибо, ничего не покупается. Передумал — /paysupport.',
    })));
    if (links.every(Boolean)) donateLinks = links;
  }
  if (!donateLinks) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: 'Telegram сейчас не открыл оплату. Попробуй /donate чуть позже.' });
    return;
  }
  await tgCall(token, 'sendMessage', { chat_id: chatId, text: DONATE_TEXT, reply_markup: {
    inline_keyboard: [STARS.map((n, i) => ({ text: `⭐ ${n}`, url: donateLinks[i] }))] } });
}
