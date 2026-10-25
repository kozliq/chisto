// Страница /admin: тянет цифры с /api/admin по ключу и рисует их. Своих данных не хранит, кроме ключа в браузере.
const STORE = 'chisto-admin-key';
const $ = id => document.getElementById(id);
let key = '';
try { key = localStorage.getItem(STORE) || ''; } catch {}

function setKey(k) {
  key = k.trim();
  try { localStorage.setItem(STORE, key); } catch {}
}
// ссылка вида …/admin#k=<ключ>: запомнили ключ и убрали его из адресной строки
const fromHash = location.hash.match(/k=([^&]+)/);
if (fromHash) { setKey(decodeURIComponent(fromHash[1])); history.replaceState(null, '', location.pathname); }

const n = x => (x || 0).toLocaleString('ru-RU');
function pl(x, one, few, many) {
  const a = Math.abs(x) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
const devices = x => `≈ ${n(x)} ${pl(x, 'устройство', 'устройства', 'устройств')}`;
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';

function dayName(d, today) {
  const diff = Math.round((new Date(today + 'T00:00:00') - new Date(d + 'T00:00:00')) / 864e5);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' }).replace('.', '');
}

const cell = x => `<td${x ? '' : ' class="zero"'}>${n(x)}</td>`;
const installs = p => (p.dl_ios || 0) + (p.dl_apk || 0) + (p.dl_chrome || 0) + (p.dl_firefox || 0);

function render(d) {
  const t = d.now, w = d.week, m = d.month, all = d.all;
  const days = d.days.length ? `<section>
      <h2>По дням</h2>
      <table>
        <tr><th></th><th colspan="3" style="text-align:center">DNS</th><th colspan="2" style="text-align:center">сайт</th><th colspan="2" style="text-align:center">бот</th></tr>
        <tr class="sub"><th></th><th>запросов</th><th>блок</th><th>устр.</th><th>заходов</th><th>скач.</th><th>сообщ.</th><th>людей</th></tr>
        ${d.days.map(x => `<tr><td>${dayName(x.day, d.today)}</td>${cell(x.dns)}${cell(x.blocked)}${cell(x.dns_users)}${cell(x.site)}${cell(installs(x))}${cell(x.bot_msg)}${cell(x.bot_users)}</tr>`).join('')}
      </table>
      <p class="note">«устр.» и «людей» — примерно (±7%): считается без запоминания адресов.</p>
    </section>` : '';

  $('main').innerHTML = `
    <div class="top">
      <div><b>${n(t.dns_users)}</b><span>${pl(t.dns_users, 'устройство', 'устройства', 'устройств')} сегодня</span></div>
      <div><b>${n(t.blocked)}</b><span>рекламных запросов убрано сегодня</span></div>
      <div><b>${n(all.blocked)}</b><span>убрано за всё время</span></div>
    </div>
    <section>
      <h2>Фильтр (DNS)</h2>
      <p class="lead">${n(t.dns)} запросов сегодня, из них убрано ${pct(t.blocked, t.dns)}</p>
      <dl>
        <dt>сегодня</dt><dd>${devices(t.dns_users)}, ${n(t.dns)} запросов</dd>
        <dt>за 7 дней</dt><dd>${devices(w.dns_users)}, ${n(w.dns)} запросов, убрано ${pct(w.blocked, w.dns)}</dd>
        <dt>за 30 дней</dt><dd>${devices(m.dns_users)}, ${n(m.dns)} запросов</dd>
        <dt>лимит Cloudflare</dt><dd>${n(t.dns)} из ${n(d.limit)} в сутки (${pct(t.dns, d.limit)})</dd>
        <dt>слишком часто</dt><dd>${n(t.limited)} отказов сегодня (больше 120 в минуту с одного адреса)</dd>
      </dl>
    </section>
    <section>
      <h2>Сайт и установка</h2>
      <p class="lead">${n(t.site)} заходов сегодня · скачано ${n(installs(t))}</p>
      <dl>
        <dt>сегодня</dt><dd>iPhone ${n(t.dl_ios)}, Android ${n(t.dl_apk)}, Chrome ${n(t.dl_chrome)}, Firefox ${n(t.dl_firefox)}</dd>
        <dt>за 7 дней</dt><dd>${n(w.site)} заходов; iPhone ${n(w.dl_ios)}, Android ${n(w.dl_apk)}, Chrome ${n(w.dl_chrome)}, Firefox ${n(w.dl_firefox)}</dd>
        <dt>за всё время</dt><dd>iPhone ${n(all.dl_ios)}, Android ${n(all.dl_apk)}, Chrome ${n(all.dl_chrome)}, Firefox ${n(all.dl_firefox)}</dd>
      </dl>
    </section>
    <section>
      <h2>Telegram-бот</h2>
      <p class="lead">${n(t.bot_msg)} сообщений сегодня · ${devices(t.bot_users).replace('устройство', 'человек').replace('устройства', 'человека').replace('устройств', 'человек')}</p>
      <dl>
        <dt>за 7 дней</dt><dd>${n(w.bot_msg)} сообщений, расширение файлом ${n(w.bot_ext)}, поделились ${n(w.bot_inline)}</dd>
        <dt>звёзды</dt><dd>${n(all.bot_stars)} ⭐ за всё время (${n(all.bot_pay)} ${pl(all.bot_pay || 0, 'платёж', 'платежа', 'платежей')})</dd>
      </dl>
    </section>
    ${days}
    <footer>
      <span>цифры без адресов и доменов</span>
      <button class="link" id="share">ссылка для телефона</button>
    </footer>`;
  $('share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#k=${encodeURIComponent(key)}`);
      $('share').textContent = 'скопировано — открой на телефоне';
    } catch { $('share').textContent = 'не получилось скопировать'; }
    setTimeout(() => { if ($('share')) $('share').textContent = 'ссылка для телефона'; }, 4000);
  };
}

function showLogin(why) {
  $('main').innerHTML = '';
  $('login').hidden = false;
  $('reload').hidden = true;
  $('at').textContent = '';
  if (why) $('login-why').textContent = why;
}

let loading = false;
async function load() {
  if (!key) return showLogin();
  if (loading) return;
  loading = true;
  $('at').textContent = 'обновляю…';
  try {
    const r = await fetch('/api/admin', { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' });
    if (r.status === 403) return showLogin('Ключ не подошёл (или база статистики ещё не подключена). Открой ссылку с ключом ещё раз или вставь её сюда.');
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    $('login').hidden = true;
    render(d);
    $('at').textContent = `в ${d.time} · `;
    $('reload').hidden = false;
  } catch {
    $('at').textContent = 'сервер не ответил · ';
    $('reload').hidden = false;
  } finally {
    loading = false;
  }
}

$('reload').onclick = load;
$('go').onclick = () => {
  const v = $('key').value.trim();
  const m = v.match(/k=([^&\s]+)/);
  if (!v) return;
  setKey(m ? decodeURIComponent(m[1]) : v);
  $('key').value = '';
  load();
};
$('key').addEventListener('keydown', e => { if (e.key === 'Enter') $('go').click(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
load();
