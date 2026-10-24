// Самопроверка тестовой страницы: что видно, а что спрятано/заблокировано.
window.addEventListener('load', () => setTimeout(() => {
  const hidden = (el) => !el || getComputedStyle(el).display === 'none' || el.offsetParent === null && getComputedStyle(el).position !== 'fixed';
  const img = document.getElementById('netBanner');
  const checks = [
    ['.adsbygoogle спрятан', hidden(document.querySelector('.adsbygoogle'))],
    ['.ad-banner спрятан', hidden(document.querySelector('.ad-banner'))],
    ['.fixture-promo спрятан', hidden(document.querySelector('.fixture-promo'))],
    ['оверлей «отключите адблок» спрятан', hidden(document.querySelector('.fixture-adblock-wall'))],
    ['.adblock-notice спрятан', hidden(document.querySelector('.adblock-notice'))],
    ['сетевой баннер не загрузился', !img.complete || img.naturalWidth === 0],
    ['прокрутка и резкость возвращены', getComputedStyle(document.querySelector('.fixture-page')).filter === 'none'],
    ['детектор адблока не загрузился, стены нет', !document.documentElement.dataset.detector && !document.querySelector('.fixture-detector-wall')],
    ['обычный текст виден', !hidden(document.getElementById('content'))],
  ];
  const ok = checks.every(([, v]) => v);
  const out = document.getElementById('result');
  out.textContent = (ok ? 'ТЕСТ ПРОЙДЕН' : 'ТЕСТ НЕ ПРОЙДЕН') + '\n' + checks.map(([n, v]) => `${v ? '✓' : '✗'} ${n}`).join('\n');
  out.style.color = ok ? '#8fe3a8' : '#ff8f8f';
  document.title = ok ? 'PASS' : 'FAIL';
}, 500));
