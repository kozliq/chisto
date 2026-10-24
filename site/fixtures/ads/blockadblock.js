// Фальшивый детектор адблока (как BlockAdBlock): если загрузился — ставит стену.
// С расширением этот файл не грузится вовсе, и стены нет.
document.documentElement.dataset.detector = 'loaded';
window.addEventListener('DOMContentLoaded', () => {
  const wall = document.createElement('div');
  wall.className = 'fixture-detector-wall';
  wall.textContent = 'Детектор: отключите блокировщик, чтобы смотреть видео';
  wall.style.cssText = 'position:fixed;inset:0;background:#000;color:#fff;display:grid;place-items:center;font-size:22px';
  document.body.append(wall);
});
