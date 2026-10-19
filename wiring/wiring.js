(function () {
  var btn = document.getElementById('wr-start');
  var stage = document.getElementById('wr-stage');
  if (!btn || !stage) return;
  var loaded = false;

  /* ------------------------------------------------------------------
     这个游戏不需要锁定鼠标（是拖拽连线），但仍然要处理两件事：
       ① 触屏拖拽连线时，滚动量会「溢出」到外层博客页，被浏览器当成
          「前进 / 后退」手势，页面会莫名跳转 —— 用 overscroll-behavior 拦住
       ② 捏合 / 手势事件同样要拦，避免误触
     只在游戏载入后拦截，不影响平时正常浏览博客。
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
    frame.src = '/games/wiring/';
    frame.title = '喇叭接线模拟器';
    // 不需要 pointer-lock；autoplay 让喇叭声能播，fullscreen 允许游戏页自己全屏
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'eager');

    stage.innerHTML = '';
    stage.appendChild(frame);
    document.documentElement.classList.add('wr-playing');

    btn.disabled = true;
    btn.textContent = '载入中…';

    fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'wr-btn ghost';
    fsBtn.textContent = '⛶ 全屏';
    fsBtn.addEventListener('click', toggleFullscreen);
    btn.parentNode.appendChild(fsBtn);

    frame.addEventListener('load', function () {
      btn.textContent = '✓ 已载入，开始接线吧';
    });
  });
})();
