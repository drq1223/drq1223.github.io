(function () {
  var btn = document.getElementById('pool-start');
  var stage = document.getElementById('pool-stage');
  if (!btn || !stage) return;
  var loaded = false;
  btn.addEventListener('click', function () {
    if (loaded) return;
    loaded = true;
    var frame = document.createElement('iframe');
    frame.src = '/games/pool/';
    frame.title = '台球小游戏';
    frame.setAttribute('allow', 'autoplay');
    frame.setAttribute('loading', 'eager');
    stage.innerHTML = '';
    stage.appendChild(frame);
    btn.disabled = true;
    btn.textContent = '载入中…';
    frame.addEventListener('load', function () { btn.textContent = '✓ 已载入，开球吧'; });
  });
})();
