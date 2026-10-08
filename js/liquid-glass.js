/* ==========================================================================
   Liquid Glass — 随鼠标移动的镜面高光
   把指针在卡片内的相对位置写入 --lg-mx / --lg-my，供 CSS 渲染高光
   ========================================================================== */
(function () {
  'use strict';

  var cfg = (window.blogEnhance && window.blogEnhance.glass) || {};
  if (cfg.enable === false) return;
  if (cfg.highlight === false) return;

  var SELECTOR = '.enh-weather, .enh-home-item, .enh-project, .enh-modal';
  var queued = false;
  var last = null;

  function apply() {
    queued = false;
    var e = last;
    if (!e || !e.target || !e.target.closest) return;

    var el = e.target.closest(SELECTOR);
    if (!el) return;

    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    el.style.setProperty('--lg-mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
    el.style.setProperty('--lg-my', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%');
  }

  document.addEventListener('mousemove', function (e) {
    last = e;
    if (!queued) {
      queued = true;
      requestAnimationFrame(apply);
    }
  }, { passive: true });
})();
