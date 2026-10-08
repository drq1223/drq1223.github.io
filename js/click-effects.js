/* ==========================================================================
   Blog Enhance — 点击特效
   模式：heart（爱心 / 表情）| particle（彩色粒子）| text（自定义文字）| ripple（涟漪）
   在 _config.yml 的 blog_enhance.clickEffect 中配置
   ========================================================================== */
(function () {
  'use strict';

  var cfg = (window.blogEnhance && window.blogEnhance.clickEffect) || {};
  if (cfg.enable === false) return;

  // 用户在系统里开启了「减少动画」则不播放特效
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var mode = cfg.mode || 'heart';
  var MAX_ON_SCREEN = 60;   // 同屏元素上限，避免连续点击造成卡顿

  var ICONS = ['❤️', '💖', '💙', '💜', '💛', '✨', '⭐', '🎈', '🍀', '🔥'];
  var COLORS = ['#ff6b9d', '#4fa9fc', '#4cb882', '#f1c84b', '#a78bfa', '#f2984a'];
  var TEXTS = (cfg.text && cfg.text.length) ? cfg.text : ['Hello', 'Hi', '✨'];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function remove(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function play(el, keyframes, duration, easing) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      remove(el);
    }

    if (typeof el.animate === 'function') {
      var anim = el.animate(keyframes, { duration: duration, easing: easing || 'ease-out' });
      anim.onfinish = finish;
      anim.oncancel = finish;
    }
    // 兜底：不支持 Web Animations API 时定时移除，避免 DOM 堆积
    setTimeout(finish, duration + 400);
    return finish;
  }

  function make(cls, x, y) {
    var el = document.createElement('span');
    el.className = 'enh-click-fx ' + cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    return el;
  }

  /* ---------- 各模式 ---------- */

  function flyUp(el, dx, dy) {
    var rot = rand(-30, 30);
    play(el, [
      { transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)', opacity: 0 },
      {
        transform: 'translate(calc(-50% + ' + (dx * 0.5) + 'px), calc(-50% + ' + (dy * 0.5) + 'px)) ' +
                   'scale(1.15) rotate(' + (rot / 2) + 'deg)',
        opacity: 1,
        offset: 0.25
      },
      {
        transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) ' +
                   'scale(.85) rotate(' + rot + 'deg)',
        opacity: 0
      }
    ], rand(900, 1400), 'cubic-bezier(.2,.8,.3,1)');
  }

  function spawnHeart(x, y) {
    var el = make('is-icon', x, y);
    el.textContent = pick(ICONS);
    flyUp(el, rand(-60, 60), rand(-110, -60));
  }

  function spawnText(x, y) {
    var el = make('is-text', x, y);
    el.textContent = pick(TEXTS);
    flyUp(el, rand(-50, 50), rand(-100, -55));
  }

  function spawnParticle(x, y) {
    var count = Math.round(rand(6, 10));
    for (var i = 0; i < count; i++) {
      var el = make('is-dot', x, y);
      el.style.background = pick(COLORS);

      var angle = (Math.PI * 2 * i) / count + rand(-0.35, 0.35);
      var dist = rand(45, 95);
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist - 25;

      play(el, [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.2)', opacity: 0 }
      ], rand(650, 1000), 'cubic-bezier(.2,.7,.3,1)');
    }
  }

  function spawnRipple(x, y) {
    var el = make('is-ripple', x, y);
    play(el, [
      { transform: 'translate(-50%, -50%) scale(.2)', opacity: .9 },
      { transform: 'translate(-50%, -50%) scale(2.8)', opacity: 0 }
    ], 700, 'ease-out');
  }

  var handlers = {
    heart: spawnHeart,
    text: spawnText,
    particle: spawnParticle,
    ripple: spawnRipple
  };

  /* ---------- 触发 ---------- */

  function onClick(e) {
    var t = e.target;
    // 输入区域不打扰
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // 同屏元素过多时跳过，保证流畅
    if (document.querySelectorAll('.enh-click-fx').length > MAX_ON_SCREEN) return;

    var fn = handlers[mode];
    if (!fn) return;
    fn(e.clientX, e.clientY);
  }

  document.addEventListener('click', onClick, { passive: true });
})();
