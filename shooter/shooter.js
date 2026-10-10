(function () {
  var btn = document.getElementById('sh-start');
  var stage = document.getElementById('sh-stage');
  if (!btn || !stage) return;
  var loaded = false;

  /* ------------------------------------------------------------------
     为什么要做这些？
     游戏在 iframe 里锁定了鼠标，但触控板 / 触摸屏的滑动会「溢出」到外层博客页，
     被浏览器当成「前进 / 后退」手势（系统会弹出「无效手势」提示），
     同时把指针锁定打断 —— 表现就是：一移动鼠标瞄准，游戏就暂停、人还被弹走。

     三层防护：
       ① 进入全屏（浏览器在全屏下不响应滑动导航，最有效）
       ② CSS：外层 html.sh-playing + iframe 的 overscroll-behavior: contain
       ③ 事件拦截：触摸 / 捏合手势 preventDefault
     ------------------------------------------------------------------ */

  function enterFullscreen() {
    var el = stage;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(el);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function stop(e) { if (e.cancelable) e.preventDefault(); }

  // 只在游戏已载入后拦截，避免影响正常浏览博客
  ['touchmove', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    window.addEventListener(t, function (e) { if (loaded) stop(e); }, { passive: false });
  });

  btn.addEventListener('click', function () {
    if (loaded) return;
    loaded = true;

    var frame = document.createElement('iframe');
    frame.src = '/games/shooter/';
    frame.title = '射击小游戏';
    // pointer-lock 让 iframe 内可以锁定鼠标；fullscreen 让游戏页自己也能全屏
    frame.setAttribute('allow', 'autoplay; pointer-lock; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'eager');

    stage.innerHTML = '';
    stage.appendChild(frame);
    document.documentElement.classList.add('sh-playing');

    btn.disabled = true;
    btn.textContent = '载入中…';

    enterFullscreen();

    frame.addEventListener('load', function () {
      btn.textContent = '✓ 已载入，开火吧（Esc 可退出全屏）';
    });
  });
})();
