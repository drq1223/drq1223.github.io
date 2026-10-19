/* ==========================================================================
   Blog Enhance — 蔚蓝档案风格点击特效 + 光标拖尾
   底层库：ba-click-fx v1.3.9（MIT，https://github.com/CialloKing/ba-click-fx）
   在 _config.yml 的 blog_enhance.baFx 中配置

   说明：
   - 库文件是官方便携 ESM，用动态 import() 懒加载，浏览器空闲时才拉取，不拖慢首屏
     （671 KB / gzip 约 260 KB，只在桌面端、首屏之后加载；触屏和窄屏完全不下载）
   - 合成方式跟随站点亮/暗主题自动切换：
       暗色 → hostCompositing: 'screen'（背景越暗越亮，辉光最好看）
       亮色 → hostCompositing: 'source-over' + overlayColorCompensation: 'bright-core'
              （白底上 screen 没有增亮空间，必须换成这套才有可见度）
   - 尊重系统「减少动画」；触屏 / 窄屏默认不启用（省电、不干扰滚动）
   - 标签页切到后台自动暂停并清屏，回来再恢复
   - 手动关闭：localStorage.setItem('blog-ba-fx', 'off')
   ========================================================================== */
(function () {
  'use strict';

  var E = window.blogEnhance || {};
  var cfg = E.baFx || {};
  if (cfg.enable === false) return;

  /* ---------- 环境判断 ---------- */

  function mq(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }

  // 系统开启「减少动画」→ 不播放
  if (cfg.respectReducedMotion !== false && mq('(prefers-reduced-motion: reduce)')) return;

  // 触屏 / 窄屏默认关闭：拖尾会和原生滚动抢手势，而且耗电
  if (cfg.disableOnMobile !== false && (mq('(pointer: coarse)') || window.innerWidth < 768)) return;

  // 手动开关
  try {
    if (window.localStorage && window.localStorage.getItem('blog-ba-fx') === 'off') return;
  } catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }

  /* ---------- 主题感知的合成方式 ---------- */

  // 站点主题类挂在 <html> 上：cosy-theme-dark / cosy-theme-light
  function isLightTheme() {
    var cl = document.documentElement.classList;
    if (cl.contains('cosy-theme-light')) return true;
    if (cl.contains('cosy-theme-dark')) return false;
    return !mq('(prefers-color-scheme: dark)');
  }

  function compositingPatch() {
    return isLightTheme()
      ? { hostCompositing: 'source-over', overlayAlphaPolicy: 'coverage', overlayColorCompensation: 'bright-core' }
      : { hostCompositing: 'screen' };
  }

  // 亮底上把辉光收一收，否则白底会出现一大片发灰的光晕
  function bloomValue() {
    var dark = typeof cfg.bloomIntensity === 'number' ? cfg.bloomIntensity : 1.7;
    var light = typeof cfg.bloomIntensityLight === 'number' ? cfg.bloomIntensityLight : 1.1;
    return isLightTheme() ? light : dark;
  }

  function applyTheme(fx) {
    try { fx.updateConfig(compositingPatch()); } catch (e) {}
    try { fx.setFxParam('bloom.intensity', bloomValue()); } catch (e) {}
  }

  function watchTheme(fx) {
    var last = isLightTheme();
    var apply = function () {
      var now = isLightTheme();
      if (now === last) return;
      last = now;
      applyTheme(fx);
    };
    if (window.MutationObserver) {
      new MutationObserver(apply).observe(document.documentElement, {
        attributes: true, attributeFilter: ['class']
      });
    }
    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
      } catch (e) {}
    }
  }

  /* ---------- 启动 ---------- */

  function boot() {
    var url = cfg.moduleUrl || (E.root || '/') + 'js/vendor/ba-click-fx.js';

    import(url).then(function (mod) {
      var Ctor = mod.BAClickFX || mod.default;
      if (typeof Ctor !== 'function') return;

      var options = Object.assign({
        // 普通未知背景网页的推荐基础配置，宿主合成再按主题覆盖
        outputCompositing: 'browser-overlay',
        hostCompositingSurface: 'dom-backdrop',
        clickEnabled: cfg.clickEnabled !== false,
        trailEnabled: cfg.trailEnabled !== false,
        trailAlways: cfg.trailAlways !== false,   // 移动鼠标就出拖尾，不必按住
        maxDpr: typeof cfg.maxDpr === 'number' ? cfg.maxDpr : 1,
        // 输入框里打字时不放特效
        inputFilter: function (ev) {
          var t = ev && ev.target;
          if (!t) return true;
          var tag = t.tagName;
          return !(tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable);
        }
      }, compositingPatch());

      if (cfg.target) options.target = cfg.target;
      if (cfg.themeColor) options.themeColor = cfg.themeColor;
      if (typeof cfg.scale === 'number') options.scale = cfg.scale;
      if (typeof cfg.opacity === 'number') options.opacity = cfg.opacity;
      if (typeof cfg.inputSamplingRate === 'number') options.inputSamplingRate = cfg.inputSamplingRate;

      var fx;
      try {
        fx = new Ctor(options);
      } catch (err) {
        try { fx = new Ctor(); } catch (err2) { return; }
      }

      // 创建瞬间的主题可能与脚本执行时刻不一致，这里按当前主题同步一次
      // （合成方式 + 辉光强度，亮暗各自一套参数）
      applyTheme(fx);

      // 亮暗主题切换时同步换合成方式
      watchTheme(fx);

      // 切到后台暂停并清屏，回来再继续
      document.addEventListener('visibilitychange', function () {
        try { fx.setPaused(document.hidden, { clear: true }); } catch (e) {}
      });

      // 对外暴露，方便控制台微调或以后接进「偏好」页
      E.baFxApi = {
        instance: fx,
        pause: function () { try { fx.setPaused(true, { clear: true }); } catch (e) {} },
        resume: function () { try { fx.setPaused(false); } catch (e) {} },
        clearTrail: function () { try { fx.clearTrail(); } catch (e) {} },
        boom: function (x, y) { try { fx.boom(x, y); } catch (e) {} },
        config: function () { try { return fx.getConfig(); } catch (e) { return null; } },
        destroy: function () { try { fx.destroy(); } catch (e) {} }
      };
    }).catch(function (err) {
      if (window.console && console.warn) console.warn('[ba-click-fx] 加载失败，特效未启用：', err);
    });
  }

  // 懒加载：首屏渲染完、浏览器空闲时再拉库
  if (cfg.lazy === false) {
    boot();
  } else if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(boot, { timeout: 3000 });
  } else {
    window.addEventListener('load', function () { setTimeout(boot, 300); });
  }
})();
