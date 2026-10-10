(function () {
  var btn = document.getElementById('pool-start');
  var stage = document.getElementById('pool-stage');
  if (!btn || !stage) return;
  var loaded = false;

  /* 游戏载入后拦住触摸滑动与捏合，避免被浏览器当成「前进/后退」手势把玩家弹走 */
  ['touchmove', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (loaded && e.cancelable) e.preventDefault();
    }, { passive: false });
  });

  btn.addEventListener('click', function () {
    if (loaded) return;
    loaded = true;
    document.documentElement.classList.add('pool-playing');
    var frame = document.createElement('iframe');
    frame.src = '/games/pool/';
    frame.title = '台球小游戏';
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'eager');
    stage.innerHTML = '';
    stage.appendChild(frame);
    btn.disabled = true;
    btn.textContent = '载入中…';
    frame.addEventListener('load', function () { btn.textContent = '✓ 已载入，开球吧'; });
  });
})();
