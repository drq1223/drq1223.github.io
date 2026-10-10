(function () {
  var btn = document.getElementById('sh-start');
  var stage = document.getElementById('sh-stage');
  if (!btn || !stage) return;
  var loaded = false;
  btn.addEventListener('click', function () {
    if (loaded) return;
    loaded = true;
    var frame = document.createElement('iframe');
    frame.src = '/games/shooter/';
    frame.title = '射击小游戏';
    frame.setAttribute('allow', 'autoplay; pointer-lock');
    frame.setAttribute('loading', 'eager');
    stage.innerHTML = '';
    stage.appendChild(frame);
    btn.disabled = true;
    btn.textContent = '载入中…';
    frame.addEventListener('load', function () { btn.textContent = '✓ 已载入，开火吧'; });
  });
})();
