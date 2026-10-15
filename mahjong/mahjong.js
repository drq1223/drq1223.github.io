(function () {
  var btn = document.getElementById('mj-start');
  var stage = document.getElementById('mj-stage');
  if (!btn || !stage) return;
  var loaded = false;

  /* ------------------------------------------------------------------
     麻将不需要锁定鼠标，但触屏/触控板上的滑动会「溢出」到外层博客页，
     被浏览器当成「前进 / 后退」手势。只在游戏载入后拦截，不影响平时浏览。
     ------------------------------------------------------------------ */
  function stop(e) { if (e.cancelable) e.preventDefault(); }
  ['touchmove', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    window.addEventListener(t, function (e) { if (loaded) stop(e); }, { passive: false });
  });

  var fsBtn = null;
  function toggleFullscreen() {
    var el = stage;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { ex.call(document); } catch (e) {} }
      return;
    }
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(el);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  btn.addEventListener('click', function () {
    if (loaded) return;
    loaded = true;

    var frame = document.createElement('iframe');
    frame.src = '/games/mahjong/';
    frame.title = '麻将';
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'eager');

    stage.innerHTML = '';
    stage.appendChild(frame);
    document.documentElement.classList.add('mj-playing');

    btn.disabled = true;
    btn.textContent = '载入中…';

    fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'mj-btn ghost';
    fsBtn.textContent = '⛶ 全屏';
    fsBtn.addEventListener('click', toggleFullscreen);
    btn.parentNode.appendChild(fsBtn);

    frame.addEventListener('load', function () {
      btn.textContent = '✓ 已载入，开局吧';
    });
  });
})();
