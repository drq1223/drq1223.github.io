/* ==========================================================================
   Apple Motion — 弹簧动效引擎
   --------------------------------------------------------------------------
   设计依据（Apple WWDC《Designing Fluid Interfaces》）：
     1. 响应要快          反馈发生在 pointerdown，不等 click
     2. 直接操控          拖拽与指针 1:1 跟随，尊重抓取偏移
     3. 可中断            任何动画都能在飞行中被抓住、反向
                          —— 所以一律从「当前屏幕上的值」起步，不从目标值起步
     4. 用弹簧，不用补间  补间有固定时长，无法响应新输入；弹簧换个目标就继续走
     5. 速度交接          手势结束时的手指速度，直接交给弹簧当天速度
     6. 动量投影          不是从松手点吸附，而是先算出「手势会停在哪」再吸附
     7. 空间一致性        从哪进就从哪出，变换原点锚定在触发它的元素上
     8. 边界橡皮筋        到边界是渐进阻力，不是硬停

   参数约定（Apple 的两个设计师友好参数）：
     damping  阻尼比 1.0 = 临界阻尼（无过冲）；< 1 有过冲
     response 响应时间（秒）—— 不是时长，弹簧没有固定时长
   默认临界阻尼；只有手势本身带惯性时才给回弹。
   ========================================================================== */
(function () {
  'use strict';

  var E = window.blogEnhance || {};
  var cfg = Object.assign({
    enable: true,        // 总开关
    press: true,         // 即时按压反馈
    cards: true,         // 卡片弹簧抬升
    modal: true,         // 搜索弹窗：材质化开合 + 下拉关闭
    lightbox: true,      // 图片灯箱：从原图缩放 + 拖拽关闭
    progress: true,      // 阅读进度条走弹簧
    details: true,       // 项目卡片弹簧展开
    reveal: true,        // 滚动揭示
    toTop: true,         // 回到顶部
    typography: true     // 正文换用系统字体（展示性的 linear / motto 不受影响）
  }, E.apple);

  if (cfg.enable === false) return;

  /* ------------------------------------------------------------------------
     0. 环境探测
     ------------------------------------------------------------------------ */
  var mqReduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  var mqCoarse = window.matchMedia
    ? window.matchMedia('(hover: none)')
    : { matches: false };

  function reduced() { return mqReduce.matches; }

  /* ======================================================================
     带毛玻璃的元素：与 liquid-glass.css 的选择器保持一致。
     这些元素上有 backdrop-filter，而「被合成/带 transform」会毁掉毛玻璃
     （实测表现为整张卡片变成一层洗旧的半透明色块，文字发灰）。
     所以下面几处一律跳过它们 —— 它们本来就有自己的弹簧曲线悬停与 :active。
     ====================================================================== */
  var GLASS_SEL = '.enh-weather, .enh-music, .enh-home-item, .enh-project, .enh-modal';
  function isGlass(el) { return !!(el && el.closest && el.closest(GLASS_SEL)); }

  var root = document.documentElement;
  root.classList.add('am-ready');
  if (cfg.typography !== false) root.classList.add('am-typo');

  /* ======================================================================
     1. 弹簧引擎
     ====================================================================== */

  // 全局 rAF 驱动器：所有弹簧共用一个时钟，避免每个动画各起一条 rAF 链
  var driver = (function () {
    var list = [];
    var raf = 0;
    var last = 0;

    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0.016;
      // 切后台回来时 dt 可能是好几秒，钳住，否则弹簧会「炸」出去
      if (dt > 0.064) dt = 0.064;
      last = now;

      // 倒着遍历：step() 里可能调用 stop() 把自己从 list 中摘掉
      for (var i = list.length - 1; i >= 0; i--) list[i].step(dt);

      if (list.length) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        last = 0;
      }
    }

    return {
      add: function (s) {
        if (list.indexOf(s) < 0) list.push(s);
        if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
      },
      remove: function (s) {
        var i = list.indexOf(s);
        if (i > -1) list.splice(i, 1);
      }
    };
  })();

  /**
   * 弹簧。value 是当前值（永远从「屏幕上的现值」起步，天然可中断）。
   * @param {number} value 初始值
   * @param {object} opt  {response, damping, epsilon, onUpdate, onRest}
   */
  function Spring(value, opt) {
    opt = opt || {};
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.response = opt.response || 0.4;
    this.damping = opt.damping == null ? 1 : opt.damping;
    this.epsilon = opt.epsilon == null ? 0.0008 : opt.epsilon;
    this.onUpdate = opt.onUpdate || function () {};
    this.onRest = opt.onRest || null;
    this._running = false;
  }

  // 由 response 反解固有频率：临界阻尼下 2% 稳定时间 ≈ 5.83/ω₀
  Spring.prototype._w0 = function () {
    return 5.83 / Math.max(0.05, this.response);
  };

  /** 重新指定目标；velocity 省略则沿用当前速度（这就是「不撞墙」的关键） */
  Spring.prototype.set = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.velocity = velocity;
    this.start();
    return this;
  };

  /** 直接跳到某个值（不动画），用于初始化 / 降级 */
  Spring.prototype.jump = function (v) {
    this.value = this.target = v;
    this.velocity = 0;
    this.stop();
    this.onUpdate(v);
    return this;
  };

  Spring.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    driver.add(this);
  };

  Spring.prototype.stop = function () {
    if (!this._running) return;
    this._running = false;
    driver.remove(this);
  };

  Spring.prototype.step = function (dt) {
    var w0 = this._w0();
    var k = w0 * w0;                 // 刚度（质量归一）
    var c = 2 * this.damping * w0;   // 阻尼系数

    // 半隐式欧拉 + 子步进：帧率低时也不会发散
    var steps = Math.max(1, Math.ceil(dt / 0.004));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }

    var scale = Math.max(1, Math.abs(this.target), Math.abs(this.value));
    if (Math.abs(this.value - this.target) < this.epsilon * scale &&
        Math.abs(this.velocity) < this.epsilon * scale * 60) {
      this.value = this.target;
      this.velocity = 0;
      this.stop();
      this.onUpdate(this.value);
      if (this.onRest) this.onRest();
      return;
    }
    this.onUpdate(this.value);
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 边界橡皮筋：越界越远，跟得越少 —— 真实的东西是「先减速再停」 */
  function rubberband(overshoot, dimension, constant) {
    constant = constant || 0.55;
    var sign = overshoot < 0 ? -1 : 1;
    var x = Math.abs(overshoot);
    return sign * (x * dimension * constant) / (dimension + constant * x);
  }

  /**
   * 动量投影：这个手势如果自由减速，会停在哪儿（指数衰减模型）。
   * 注意不是物理课本的 v²/(2a)，Apple 用的是这个形式。
   * @param {number} v px/s
   */
  function project(v, decelerationRate) {
    decelerationRate = decelerationRate || 0.998;
    return (v / 1000) * decelerationRate / (1 - decelerationRate);
  }

  /** 速度采样器：保留最近几个 pointermove 的时间与位置 */
  function VelocityTracker() {
    this.samples = [];
  }
  VelocityTracker.prototype.add = function (x, t) {
    this.samples.push({ x: x, t: t });
    if (this.samples.length > 6) this.samples.shift();
  };
  VelocityTracker.prototype.velocity = function () {
    var s = this.samples;
    if (s.length < 2) return 0;
    var a = s[0], b = s[s.length - 1];
    var dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    // 用最近一段的平均速度，比只用最后两点稳
    return (b.x - a.x) / dt;
  };
  VelocityTracker.prototype.reset = function (x, t) {
    this.samples = [{ x: x, t: t }];
  };

  /* ======================================================================
     2. 即时按压反馈
     --------------------------------------------------------------------------
     反馈必须发生在 pointerdown。用 CSS transition 处理按下（90ms），
     抬起交给一条略带回弹的曲线 —— 手指确实带走了速度，所以这里给一点过冲是对的。
     另加约 10px 的迟滞：按住后拖离目标会取消，拖回来会重新按下。
     ====================================================================== */
  var PRESS_SEL = 'a, button, summary, [role="button"], .enh-search-box, ' +
    '.enh-result, .enh-tag-item, cosy-icon, cosy-short-key, cosy-switch, .enh-theme-btn';
  var PRESS_SKIP = 'input, textarea, select, [contenteditable="true"], [data-no-press]';

  function initPress() {
    if (cfg.press === false || reduced()) return;
    if (mqCoarse.matches) return; // 触屏没有 hover，按压态只会残留，跳过

    var current = null;
    var startX = 0, startY = 0;
    var startEl = null;

    function down(e) {
      if (e.button != null && e.button !== 0) return;
      var el = e.target.closest ? e.target.closest(PRESS_SEL) : null;
      if (!el) return;
      if (el.closest(PRESS_SKIP)) return;
      if (isGlass(el)) return;         // 毛玻璃元素有自己的 :active，别给它加 transform

      startEl = el;
      startX = e.clientX;
      startY = e.clientY;
      setPressed(el, true);
    }

    function setPressed(el, on) {
      if (!el) return;
      if (on) {
        if (current && current !== el) current.classList.remove('am-pressed');
        if (!el.classList.contains('am-pressable')) el.classList.add('am-pressable');
        el.classList.add('am-pressed');
        current = el;
      } else if (current === el) {
        el.classList.remove('am-pressed');
        current = null;
      }
    }

    function move(e) {
      if (!startEl) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      // 迟滞：拖出 12px 视为放弃按压，拖回来重新按下（可撤销）
      var out = Math.sqrt(dx * dx + dy * dy) > 12;
      var stillOn = startEl.contains(document.elementFromPoint(e.clientX, e.clientY));
      setPressed(startEl, !out && stillOn);
    }

    function up() {
      if (!startEl) return;
      setPressed(startEl, false);
      startEl = null;
    }

    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    // 页面跳转前清掉，避免返回时残留按下态
    window.addEventListener('pagehide', up);
  }

  /* ======================================================================
     3. 卡片：悬停弹簧抬升 + 按压
     --------------------------------------------------------------------------
     lift / press 各是一条独立弹簧（2D 运动分解成独立的一维弹簧，
     合成时不会互相拖累），每一帧组合成最终 transform。
     ====================================================================== */
  function initCards() {
    if (cfg.cards === false || reduced()) return;
    if (mqCoarse.matches) return;

    // 注意：不含 .enh-home-item —— 它是毛玻璃卡片，见文件开头的 GLASS_SEL 说明。
    // 少了这几个字母，整张卡片的玻璃会变成一层洗旧的半透明色块。
    var cards = document.querySelectorAll('.enh-friend, .enh-tag-item');
    Array.prototype.forEach.call(cards, function (el) {
      el.classList.add('am-card');

      var lift = new Spring(0, {
        response: 0.4, damping: 1,
        onUpdate: render
      });
      var press = new Spring(0, {
        response: 0.3, damping: 1,
        onUpdate: render
      });

      function render() {
        // 两条弹簧都停下时把 transform 也撤掉：常驻的内联 transform 会一直把元素
        // 留在合成层里，纯属浪费（对有 backdrop-filter 的元素更是直接毁掉毛玻璃）。
        if (lift.value === 0 && press.value === 0 &&
            !lift._running && !press._running) {
          el.style.transform = '';
          el.style.willChange = 'auto';
          return;
        }
        var l = lift.value, p = press.value;
        el.style.transform =
          'translate3d(0,' + (l * -6).toFixed(3) + 'px,0) ' +
          'scale(' + (1 - p * 0.025 + l * 0.004).toFixed(5) + ')';
        if (!lift._running && !press._running) el.style.willChange = 'auto';
      }

      function on() {
        el.style.willChange = 'transform';
        lift.set(1);
      }
      function off() {
        lift.set(0);
      }
      function down() { press.set(1); }
      function release() { press.set(0); }

      el.addEventListener('pointerenter', on);
      el.addEventListener('pointerleave', function () { off(); release(); });
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });
  }

  /* ======================================================================
     4. 搜索弹窗：材质化开合 + 下拉拖拽关闭
     --------------------------------------------------------------------------
     开：模糊半径、缩放、透明度一起动 —— 读起来像一块材料落下，而不是淡入。
     关：可下拉。向下跟手 1:1，向上橡皮筋；松手时先做动量投影，
         再决定是关掉还是弹回，并把手指速度原样交给弹簧（无接缝）。
     ====================================================================== */
  var modalState = null;

  function isDragHandle(t) {
    if (!t || !t.closest) return false;
    if (t.closest('#enh-search-input')) return false;      // 别抢输入框的选择手势
    return !!(t.closest('.enh-modal-head') || t.closest('.enh-modal-foot'));
  }

  function modalIn(mask, trigger) {
    if (cfg.modal === false) return false;
    var panel = mask.querySelector('.enh-modal');
    if (!panel) return false;

    // 空间一致性：从触发它的元素那个方向长出来
    if (trigger) {
      var pr = panel.getBoundingClientRect();
      var tr = trigger.getBoundingClientRect();
      if (pr.width && tr.width) {
        panel.style.transformOrigin =
          clamp(tr.left + tr.width / 2 - pr.left, 0, pr.width).toFixed(1) + 'px ' +
          clamp(tr.top + tr.height / 2 - pr.top, 0, pr.height).toFixed(1) + 'px';
      }
    } else {
      panel.style.transformOrigin = '50% 0%';
    }

    if (reduced()) { paintModal(mask, panel, 1); return true; }

    if (!modalState || modalState.mask !== mask) {
      modalState = {
        mask: mask, panel: panel,
        s: new Spring(0, { response: 0.32, damping: 1, onUpdate: function (v) { paintModal(mask, panel, v); } })
      };
      bindModalDrag(mask, panel, modalState);
    }
    modalState.s.value = 0;
    modalState.s.velocity = 0;
    panel.style.transform = '';   // 清掉拖拽残留
    modalState.s.set(1, 0);
    return true;
  }

  function paintModal(mask, panel, v) {
    // 材质化：模糊半径与缩放一起动
    mask.style.background = 'rgba(0,0,0,' + (v * 0.45).toFixed(3) + ')';
    mask.style.backdropFilter = mask.style.webkitBackdropFilter = 'blur(' + (v * 6).toFixed(2) + 'px)';
    // .enh-modal 自己也是毛玻璃：动画一停就把 transform / opacity 撤掉，
    // 否则常驻的内联 transform 会让它的玻璃失效（同 GLASS_SEL 的坑）。
    if (v > 0.9995) {
      panel.style.transform = '';
      panel.style.opacity = '';
      return;
    }
    panel.style.opacity = v.toFixed(3);
    panel.style.transform =
      'translate3d(0,' + ((1 - v) * -14).toFixed(2) + 'px,0) scale(' + (0.93 + 0.07 * v).toFixed(4) + ')';
  }

  function modalOut(mask, done) {
    if (cfg.modal === false) return false;
    var panel = mask.querySelector('.enh-modal');
    if (!panel) return false;

    if (reduced() || !modalState || modalState.mask !== mask) {
      if (panel) { panel.style.transform = ''; panel.style.opacity = ''; }
      return false;
    }

    mask.classList.add('is-animating');
    modalState.s.set(0, modalState.s.velocity);
    modalState.s.onRest = function () {
      mask.classList.remove('is-animating');
      mask.classList.remove('is-open');
      panel.style.transform = '';
      panel.style.opacity = '';
      mask.style.background = '';
      mask.style.backdropFilter = mask.style.webkitBackdropFilter = '';
      modalState.s.onRest = null;
      if (done) done();
    };
    return true;
  }

  function bindModalDrag(mask, panel, state) {
    var dragging = false, startY = 0, base = 0, tracker;

    panel.addEventListener('pointerdown', function (e) {
      if (!isDragHandle(e.target)) return;
      dragging = true;
      startY = e.clientY;
      base = 0;
      tracker = new VelocityTracker();
      tracker.reset(e.clientY, e.timeStamp || Date.now());
      state.s.stop();                       // 抓住飞行动画：从当前值继续
      panel.style.willChange = 'transform';
      // 指针捕获：拖出面板范围后依然跟手（否则一离开元素就跟丢了）
      try { panel.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器忽略 */ }
    });

    panel.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      tracker.add(e.clientY, e.timeStamp || Date.now());
      // 向下 1:1，向上橡皮筋（上面没有更多内容了）
      base = dy > 0 ? dy : rubberband(dy, panel.offsetHeight || 400);
      panel.style.transform = 'translate3d(0,' + base.toFixed(2) + 'px,0)';
      // 拖得越远，背景越淡 —— 过程中的每一帧都在预告结局
      var fade = clamp(1 - Math.abs(base) / 320, 0.15, 1);
      panel.style.opacity = fade.toFixed(3);
      mask.style.background = 'rgba(0,0,0,' + (0.45 * fade).toFixed(3) + ')';
      mask.style.backdropFilter = mask.style.webkitBackdropFilter =
        'blur(' + (6 * fade).toFixed(2) + 'px)';
    });

    function end(e) {
      if (!dragging) return;
      dragging = false;
      panel.style.willChange = 'auto';

      var v = tracker.velocity();                 // px/s，速度交接
      var projected = base + project(v, 0.998);   // 动量投影：手势会停在哪
      var shouldClose = projected > 120 || (v > 700 && base > 0);

      if (shouldClose) {
        // 位移量单独用一条弹簧走完：把它和「开合进度」那条分开，
        // 两个自由度各算各的，不会互相覆盖 transform。
        var out = new Spring(base, {
          response: 0.3, damping: 1,
          onUpdate: function (y) {
            panel.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
            var fade = clamp(1 - Math.abs(y) / 320, 0, 1);
            panel.style.opacity = fade.toFixed(3);
            mask.style.background = 'rgba(0,0,0,' + (0.45 * fade).toFixed(3) + ')';
            mask.style.backdropFilter = mask.style.webkitBackdropFilter =
              'blur(' + (6 * fade).toFixed(2) + 'px)';
          },
          onRest: function () {
            mask.classList.remove('is-open');
            panel.style.transform = '';
            panel.style.opacity = '';
            mask.style.background = '';
            mask.style.backdropFilter = mask.style.webkitBackdropFilter = '';
          }
        });
        out.set(560, v);
      } else {
        // 弹回原位：带上手指速度，不要硬切
        var back = new Spring(base, {
          response: 0.35, damping: 1,
          onUpdate: function (y) {
            panel.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
            var fade = clamp(1 - Math.abs(y) / 320, 0, 1);
            panel.style.opacity = fade.toFixed(3);
            mask.style.background = 'rgba(0,0,0,' + (0.45 * fade).toFixed(3) + ')';
            mask.style.backdropFilter = mask.style.webkitBackdropFilter =
              'blur(' + (6 * fade).toFixed(2) + 'px)';
          },
          onRest: function () { panel.style.transform = ''; panel.style.opacity = ''; }
        });
        back.set(0, v);
      }
    }

    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }

  /* ======================================================================
     5. 图片灯箱：从原图位置缩放展开 + 拖拽关闭
     --------------------------------------------------------------------------
     从缩略图那块区域长出来、也缩回那块区域 —— 进出走同一条路径。
     ====================================================================== */
  var lbState = null;

  function whenImgReady(img, cb) {
    if (img.complete && img.naturalWidth) { cb(); return; }
    img.addEventListener('load', function () { cb(); }, { once: true });
    img.addEventListener('error', function () { cb(); }, { once: true });
  }

  function lightboxIn(lb, img, fromRect) {
    if (cfg.lightbox === false) return false;
    if (!img) return false;

    if (reduced()) { paintLb(lb, img, 1); return true; }

    if (!lbState || lbState.lb !== lb) {
      lbState = {
        lb: lb, img: img,
        s: new Spring(0, { response: 0.36, damping: 1, onUpdate: function (v) { paintLb(lb, img, v); } })
      };
      bindLbDrag(lb, img, lbState);
    }

    whenImgReady(img, function () {
      var to = img.getBoundingClientRect();
      lbState.from = null;
      if (fromRect && to.width > 0 && to.height > 0) {
        // FLIP：算出「从缩略图到最终位置」的位移与缩放
        lbState.from = {
          dx: (fromRect.left + fromRect.width / 2) - (to.left + to.width / 2),
          dy: (fromRect.top + fromRect.height / 2) - (to.top + to.height / 2),
          scale: Math.max(0.08, Math.min(fromRect.width / to.width, 4))
        };
      }
      lbState.s.value = 0;
      lbState.s.velocity = 0;
      lbState.s.set(1, 0);
    });
    return true;
  }

  function paintLb(lb, img, v) {
    lb.style.background = 'rgba(0,0,0,' + (0.82 * v).toFixed(3) + ')';
    if (!img) return;
    var f = lbState && lbState.from;
    if (!f) {
      img.style.opacity = v.toFixed(3);
      img.style.transform = 'scale(' + (0.9 + 0.1 * v).toFixed(4) + ')';
      return;
    }
    var dx = f.dx * (1 - v), dy = f.dy * (1 - v);
    var sc = f.scale + (1 - f.scale) * v;
    img.style.opacity = Math.min(1, v * 1.6).toFixed(3);
    img.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
  }

  function lightboxOut(lb, done) {
    if (cfg.lightbox === false) return false;
    var img = lb.querySelector('img');
    if (reduced() || !lbState || lbState.lb !== lb) {
      if (img) { img.style.transform = ''; img.style.opacity = ''; }
      return false;
    }
    lbState.s.set(0, lbState.s.velocity);
    lbState.s.onRest = function () {
      lb.classList.remove('is-open');
      if (img) { img.style.transform = ''; img.style.opacity = ''; }
      lb.style.background = '';
      lbState.s.onRest = null;
      if (done) done();
    };
    return true;
  }

  function bindLbDrag(lb, img, state) {
    var dragging = false, startY = 0, base = 0, tracker;

    img.addEventListener('pointerdown', function (e) {
      dragging = true;
      startY = e.clientY;
      base = 0;
      tracker = new VelocityTracker();
      tracker.reset(e.clientY, e.timeStamp || Date.now());
      state.s.stop();
      img.style.willChange = 'transform';
      try { img.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器忽略 */ }
    });

    img.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      tracker.add(e.clientY, e.timeStamp || Date.now());
      base = dy > 0 ? dy : rubberband(dy, window.innerHeight || 800);
      img.style.transform = 'translate3d(0,' + base.toFixed(2) + 'px,0) scale(' +
        clamp(1 - Math.abs(base) / 1600, 0.82, 1).toFixed(4) + ')';
      lb.style.background = 'rgba(0,0,0,' + clamp(0.82 - Math.abs(base) / 700, 0, 0.82).toFixed(3) + ')';
    });

    function end() {
      if (!dragging) return;
      dragging = false;
      img.style.willChange = 'auto';
      var v = tracker.velocity();
      var projected = base + project(v, 0.998);
      var shouldClose = projected > 140 || Math.abs(v) > 900;

      var out = new Spring(base, {
        response: 0.32, damping: 1,
        onUpdate: function (y) {
          img.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0) scale(' +
            clamp(1 - Math.abs(y) / 1600, 0.82, 1).toFixed(4) + ')';
          lb.style.background = 'rgba(0,0,0,' + clamp(0.82 - Math.abs(y) / 700, 0, 0.82).toFixed(3) + ')';
        }
      });

      if (shouldClose) {
        out.set(window.innerHeight * 0.6, v);
        out.onRest = function () {
          lb.classList.remove('is-open');
          img.style.transform = '';
          img.style.opacity = '';
          lb.style.background = '';
        };
      } else {
        out.set(0, v);
        out.onRest = function () { img.style.transform = ''; lb.style.background = ''; };
      }
    }

    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', end);
  }

  /* ======================================================================
     6. 阅读进度条：走弹簧，不再是线性 80ms 硬跟
     ====================================================================== */
  function initProgress() {
    if (cfg.progress === false) return;
    var bar = document.getElementById('enh-progress');
    if (!bar) return;

    if (reduced()) return;   // 保留原本的 CSS transition

    // enhance.js 已经算好了滚动百分比，这里只负责「表现层」的平滑。
    // 不直接改 #enh-progress 的宽度 —— 否则自己的写入会被 MutationObserver
    // 当成新目标，形成自激振荡。改成：把原条藏起来，另起一条影子条走弹簧，
    // 影子条的目标值通过观察原条拿到，两个元素各写各的，环就断了。
    //
    // 影子条必须顶替 #enh-progress 这个 id，否则拿不到那套 fixed 定位与发光的样式。
    // enhance.js 只在初始化时按 id 查过一次并缓存了引用，此刻换 id 不影响它。
    bar.style.visibility = 'hidden';
    bar.id = 'enh-progress-src';
    /* id 一改，CSS 里 #enh-progress{position:fixed} 这条规则就失配了，
       元素会掉回默认的 position:static —— body 本身就是 #app（display:flex），
       于是它成了 flex 子项，实打实参与横向布局。
       而它的宽度恰好就是进度百分比（enhance.js 每帧写 width:X%），
       滚动越深它就越宽，把 #app > main 一路挤窄 ——
       表现在用户眼里就是「往下滚动时页面宽度会变」。
       这里用 absolute 把它挪出布局流、丢到视口外，只当数据源用：
       width 照旧由 enhance.js 写，影子条靠 MutationObserver 读内联样式拿值，不受影响。 */
    bar.style.position = 'absolute';
    bar.style.top = '-9999px';
    bar.style.left = '0';
    bar.style.pointerEvents = 'none';

    var shadow = bar.cloneNode(false);
    shadow.id = 'enh-progress';
    shadow.style.visibility = 'visible';
    shadow.style.width = '0%';
    bar.parentNode.insertBefore(shadow, bar.nextSibling);

    var s = new Spring(0, {
      response: 0.35, damping: 1,
      onUpdate: function (v) { shadow.style.width = v.toFixed(2) + '%'; }
    });

    var last = -1;
    new MutationObserver(function () {
      var w = parseFloat(bar.style.width) || 0;
      if (Math.abs(w - last) < 0.01) return;
      last = w;
      s.set(w);
    }).observe(bar, { attributes: true, attributeFilter: ['style'] });
  }

  /* ======================================================================
     7. 项目卡片（<details>）：高度走弹簧展开
     ====================================================================== */
  function initDetails() {
    if (cfg.details === false || reduced()) return;
    var items = document.querySelectorAll('details.enh-project');
    Array.prototype.forEach.call(items, function (d) {
      var body = d.querySelector('.enh-project-body');
      var summary = d.querySelector('.enh-project-summary');
      if (!body || !summary) return;

      // <details> 一旦 open=false 浏览器会立刻把内容藏起来，收起动画根本没机会播。
      // 所以自己接管点击：收起时先保持 open，把高度弹簧走到 0，到点再真正关掉。
      summary.addEventListener('click', function (e) {
        e.preventDefault();

        var s = new Spring(0, { response: 0.38, damping: 1 });

        if (d.open) {
          var from = body.scrollHeight;
          body.style.overflow = 'hidden';
          body.style.height = from + 'px';
          void body.offsetHeight;           // 强制回流，否则两次赋值会被合并成一帧
          s.value = from;
          s.onUpdate = function (v) { body.style.height = v.toFixed(2) + 'px'; };
          s.onRest = function () {
            d.open = false;
            body.style.height = '';
            body.style.overflow = '';
          };
          s.set(0);
        } else {
          d.open = true;
          var target = body.scrollHeight;
          body.style.overflow = 'hidden';
          body.style.height = '0px';
          void body.offsetHeight;
          s.value = 0;
          s.onUpdate = function (v) { body.style.height = v.toFixed(2) + 'px'; };
          s.onRest = function () {
            body.style.height = '';
            body.style.overflow = '';
          };
          s.set(target);
        }
      });
    });
  }

  /* ======================================================================
     8. 滚动揭示：进入视口时弹簧浮起，同组条目依次错开
     ====================================================================== */
  function initReveal() {
    if (cfg.reveal === false || reduced()) return;
    if (!('IntersectionObserver' in window)) return;

    var groups = [
      '.enh-home-list .enh-home-item',
      '.enh-home-list .enh-project',
      '.enh-friends .enh-friend'
    ];

    var items = [];
    groups.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el, i) {
        el.classList.add('am-reveal');
        items.push({ el: el, delay: Math.min(i, 6) * 45 });
      });
    });
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (it) { it.el.style.opacity = ''; });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var it = items.filter(function (x) { return x.el === en.target; })[0];
        io.unobserve(en.target);
        if (!it || it.done) return;
        it.done = true;
        setTimeout(function () {
          it.el.style.willChange = 'opacity';
          // 毛玻璃卡片不能带动画位移：一给 transform，它的 backdrop-filter 就失效，
          // 整张卡片会变成洗旧的半透明色块。这些卡片只做淡入。
          var glass = isGlass(it.el);
          var s = new Spring(0, {
            response: 0.45, damping: 1,
            onUpdate: function (v) {
              it.el.style.opacity = v.toFixed(3);
              if (!glass) {
                it.el.style.transform = 'translate3d(0,' + ((1 - v) * 16).toFixed(2) + 'px,0)';
              }
            },
            onRest: function () {
              it.el.style.willChange = 'auto';
              if (!glass) it.el.style.transform = '';
            }
          });
          s.set(1);
        }, it.delay);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (it) { io.observe(it.el); });

    // 保险丝：万一 rAF 链因故中断（某个 onUpdate 抛错就会这样），
    // 卡片不能永远停在半透明状态。两秒后还没演完的一律直接落到终态。
    setTimeout(function () {
      items.forEach(function (it) {
        if (it.done) return;
        it.done = true;
        it.el.style.opacity = '1';
        it.el.style.transform = '';
        it.el.style.willChange = 'auto';
      });
    }, 2000);
  }

  /* ======================================================================
     9. 回到顶部：材质按钮 + 弹簧滚动
     ====================================================================== */
  function getScroller() {
    // 只认 .cosy-scrollbar —— 主题里真正能滚的容器都带这个类。
    // 外层 #app > main 是 overflow:hidden 的固定层，算出来的溢出量会把判断带偏。
    var cands = document.querySelectorAll('.cosy-scrollbar');
    var best = null;
    Array.prototype.forEach.call(cands, function (el) {
      var over = el.scrollHeight - el.clientHeight;
      if (over > 40 && (!best || over > best.scrollHeight - best.clientHeight)) best = el;
    });
    return best || document.scrollingElement || document.documentElement;
  }

  function initToTop() {
    if (cfg.toTop === false) return;

    var btn = document.createElement('button');
    btn.id = 'am-to-top';
    btn.type = 'button';
    btn.title = '回到顶部';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
    document.body.appendChild(btn);

    var scroller = getScroller();
    var shown = false;

    var s = new Spring(0, {
      response: 0.4, damping: 1,
      onUpdate: function (v) {
        btn.style.opacity = v.toFixed(3);
        btn.style.transform = 'scale(' + (0.82 + 0.18 * v).toFixed(4) + ') ' +
          'translate3d(0,' + ((1 - v) * 10).toFixed(2) + 'px,0)';
      },
      // 按钮自己也是毛玻璃，和卡片同理：静止时必须把 transform 撤掉
      onRest: function () { btn.style.transform = ''; }
    });

    function onScroll() {
      var top = (scroller === document.scrollingElement || scroller === document.documentElement)
        ? (window.pageYOffset || 0) : scroller.scrollTop;
      var next = top > 400;
      if (next === shown) return;
      shown = next;
      btn.classList.toggle('is-visible', next);
      s.set(next ? 1 : 0);
    }

    (scroller === document.scrollingElement || scroller === document.documentElement
      ? window : scroller).addEventListener('scroll', onScroll, { passive: true });

    btn.addEventListener('click', function () {
      var start = (scroller === document.scrollingElement || scroller === document.documentElement)
        ? (window.pageYOffset || 0) : scroller.scrollTop;
      if (reduced()) {
        if (scroller.scrollTo) scroller.scrollTo(0, 0); else window.scrollTo(0, 0);
        return;
      }
      var ss = new Spring(start, {
        response: 0.55, damping: 1,
        onUpdate: function (v) {
          if (scroller === document.scrollingElement || scroller === document.documentElement) {
            window.scrollTo(0, v);
          } else {
            scroller.scrollTop = v;
          }
        }
      });
      ss.set(0);
    });
  }

  /* ======================================================================
     10. 滚动边缘渐隐：内容接到悬浮栏时淡出，替代生硬分隔线
     ====================================================================== */
  function initEdgeFade() {
    var nav = document.querySelector('.category-nav');
    if (!nav) return;
    nav.classList.add('am-edge-fade', 'am-scroll');
    function upd() {
      nav.classList.toggle('is-scrolled-up', nav.scrollTop > 4 &&
        nav.scrollTop < nav.scrollHeight - nav.clientHeight - 4);
    }
    nav.addEventListener('scroll', upd, { passive: true });
    upd();
  }

  function initScrollbars() {
    Array.prototype.forEach.call(document.querySelectorAll('.cosy-scrollbar'), function (el) {
      el.classList.add('am-scroll');
    });
  }

  /* ======================================================================
     11. 对外钩子 —— 供 search.js / enhance.js 调用
     --------------------------------------------------------------------------
     这些函数在 apple-motion.js 解析时就挂上（早于 enhance.js / search.js），
     所以那两个脚本里只需 `if (window.amAnimate) ...` 即可，拿不到就走原逻辑。
     ====================================================================== */
  window.amAnimate = {
    modalIn: modalIn,
    modalOut: modalOut,
    lightboxIn: lightboxIn,
    lightboxOut: lightboxOut,
    Spring: Spring
  };

  /* ------------------------------------------------------------------------
     启动
     ------------------------------------------------------------------------ */
  function init() {
    initPress();
    initCards();
    initDetails();
    initReveal();
    initScrollbars();
    initEdgeFade();
    initToTop();
    // 进度条是 enhance.js 动态创建的，而 apple-motion.js 在它之前加载，
    // DOMContentLoaded 回调也就排在它前面 —— 这里必须让出一个宏任务才能拿到那根条。
    setTimeout(initProgress, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
