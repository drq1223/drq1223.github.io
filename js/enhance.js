/* ==========================================================================
   Blog Enhance — 阅读体验 / 统计 / 外观
   ========================================================================== */
(function () {
  'use strict';

  var E = window.blogEnhance || {};
  var cfg = E.enhance || {};
  var THEME_KEY = 'cosy-theme:theme';

  /* ======================================================================
     1. 顶部阅读进度条
     ====================================================================== */
  function initProgress() {
    if (cfg.progress === false) return;
    if (!document.querySelector('.post-container')) return; // 仅文章页

    var bar = document.createElement('div');
    bar.id = 'enh-progress';
    document.body.appendChild(bar);

    // 文章页的滚动容器是 .post-container > main.cosy-scrollbar
    var scroller = document.querySelector('.post-container .cosy-scrollbar') || window;

    function update() {
      var doc = document.documentElement;
      var scrollTop, height;
      if (scroller === window) {
        scrollTop = window.pageYOffset || doc.scrollTop;
        height = doc.scrollHeight - doc.clientHeight;
      } else {
        scrollTop = scroller.scrollTop;
        height = scroller.scrollHeight - scroller.clientHeight;
      }
      var pct = height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0;
      bar.style.width = pct + '%';
    }

    (scroller === window ? window : scroller).addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ======================================================================
     2. 文章元信息：字数 / 阅读时长 / 阅读量
     ====================================================================== */
  function countWords(text) {
    var cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    return cn + en;
  }

  function initPostMeta() {
    if (cfg.postMeta === false) return;
    var article = document.querySelector('.article-container article');
    if (!article) return;

    var words = window.postMeta && window.postMeta.words;
    if (typeof words !== 'number') {
      // 构建期未注入时，客户端兜底计算（去掉代码块内容，更贴近正文）
      var clone = article.cloneNode(true);
      var codes = clone.querySelectorAll('pre, code');
      Array.prototype.forEach.call(codes, function (c) { c.remove(); });
      words = countWords(clone.textContent || '');
    }
    var minutes = Math.max(1, Math.round(words / 300));

    var wrap = document.createElement('div');
    wrap.className = 'enh-post-meta';
    wrap.innerHTML =
      '<span class="enh-item">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M4 6h16M4 12h16M4 18h10"></path>' +
        '</svg>' + words + ' 字' +
      '</span>' +
      '<span class="enh-item">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>' +
        '</svg>约 ' + minutes + ' 分钟' +
      '</span>' +
      '<span class="enh-item" id="enh-page-pv" style="display:none">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z"></path>' +
          '<circle cx="12" cy="12" r="3"></circle>' +
        '</svg><span id="busuanzi_value_page_pv">0</span> 次阅读' +
      '</span>';

    var title = article.querySelector('.post-title');
    var anchor = title && title.nextElementSibling; // .last-updated
    if (anchor && anchor.classList.contains('last-updated')) {
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    } else {
      article.insertBefore(wrap, article.firstChild.nextSibling || article.firstChild);
    }
  }

  /* ======================================================================
     3. 代码块一键复制
     ====================================================================== */
  function initCodeCopy() {
    if (cfg.codeCopy === false) return;
    var pres = document.querySelectorAll('.article-container article pre');
    if (!pres.length) return;

    Array.prototype.forEach.call(pres, function (pre) {
      if (pre.parentNode.classList.contains('enh-code-wrap')) return;
      if (pre.offsetParent === null) return; // 跳过隐藏元素（如折叠代码块）

      var wrap = document.createElement('div');
      wrap.className = 'enh-code-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      var btn = document.createElement('button');
      btn.className = 'enh-copy-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      wrap.appendChild(btn);

      btn.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        var text = code.textContent || '';
        var done = function () {
          btn.textContent = '已复制';
          btn.classList.add('is-done');
          setTimeout(function () {
            btn.textContent = '复制';
            btn.classList.remove('is-done');
          }, 1600);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }

        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
          document.body.removeChild(ta);
        }
      });
    });
  }

  /* ======================================================================
     4. 图片灯箱
     ====================================================================== */
  function initLightbox() {
    if (cfg.lightbox === false) return;
    var imgs = document.querySelectorAll('.article-container article img');
    if (!imgs.length) return;

    var lb = document.createElement('div');
    lb.id = 'enh-lightbox';
    lb.innerHTML = '<img alt="">';
    document.body.appendChild(lb);
    var lbImg = lb.querySelector('img');

    Array.prototype.forEach.call(imgs, function (img) {
      img.classList.add('enh-zoomable');
      img.addEventListener('click', function () {
        lbImg.src = img.src;
        lbImg.alt = img.alt || '';
        lb.classList.add('is-open');
      });
    });

    lb.addEventListener('click', function () { lb.classList.remove('is-open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') lb.classList.remove('is-open');
    });
  }

  /* ======================================================================
     5. 亮 / 暗色切换
     ====================================================================== */
  function initThemeToggle() {
    if (cfg.themeToggle === false) return;
    var bottom = document.querySelector('#aside-box .bottom');
    if (!bottom) return;

    var wrap = document.createElement('div');
    wrap.className = 'enh-aside-actions';
    wrap.innerHTML =
      '<button class="enh-theme-btn" type="button" title="切换亮色 / 暗色">' +
        '<svg class="enh-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
          '<circle cx="12" cy="12" r="4"></circle>' +
          '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path>' +
        '</svg>' +
        '<svg class="enh-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>' +
        '</svg>' +
      '</button>';

    bottom.parentNode.insertBefore(wrap, bottom);

    wrap.querySelector('.enh-theme-btn').addEventListener('click', function () {
      var cur = document.documentElement.classList.contains('cosy-theme-light') ? 'light' : 'dark';
      var next = cur === 'dark' ? 'light' : 'dark';
      var cl = document.documentElement.classList;
      cl.remove('cosy-theme-dark', 'cosy-theme-light');
      cl.add('cosy-theme-' + next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略隐私模式报错 */ }
    });
  }

  /* ======================================================================
     6. 页脚站点统计
     ====================================================================== */
  function initSiteStats() {
    if (cfg.siteStats === false) return;
    var main = document.querySelector('main');
    if (!main) return;

    var s = E.stats || {};
    var html = '';
    if (s.posts) html += '<span class="enh-stat">文章 <b>' + s.posts + '</b> 篇</span>';
    if (s.words) html += '<span class="enh-stat">共 <b>' + s.words + '</b> 字</span>';
    if (s.since) html += '<span class="enh-stat">运行 <b id="enh-runtime">—</b></span>';
    if (s.busuanzi) {
      html += '<span class="enh-stat" id="enh-uv" style="display:none">访客 <b id="busuanzi_value_site_uv">0</b></span>' +
              '<span class="enh-stat" id="enh-pv" style="display:none">访问 <b id="busuanzi_value_site_pv">0</b></span>';
    }

    if (!html) return;

    var footer = document.createElement('footer');
    footer.className = 'enh-site-stats';
    footer.innerHTML = html;
    main.appendChild(footer);

    if (s.since) startRuntime(s.since);
    if (s.busuanzi) loadBusuanzi();
  }

  function startRuntime(since) {
    var el = document.getElementById('enh-runtime');
    if (!el) return;
    var start = new Date(since.replace(/-/g, '/')).getTime();
    if (isNaN(start)) { el.textContent = '—'; return; }

    function tick() {
      var d = Math.floor((Date.now() - start) / 86400000);
      var h = Math.floor((Date.now() - start) / 3600000) % 24;
      el.textContent = d + ' 天 ' + h + ' 小时';
    }
    tick();
    setInterval(tick, 3600000);
  }

  function loadBusuanzi() {
    var script = document.createElement('script');
    script.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
    script.async = true;
    // 加载成功后再显示，失败则隐藏，避免出现无意义的 0
    script.onload = function () {
      ['enh-uv', 'enh-pv', 'enh-page-pv'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = '';
      });
    };
    document.head.appendChild(script);
  }

  /* ======================================================================
     6.5 首页：让 main 可滚动，否则最新文章列表会被 overflow:hidden 裁掉
     ====================================================================== */
  function initHomeScroll() {
    var main = document.querySelector('#app > main') || document.querySelector('main');
    if (main && document.querySelector('.enh-home-posts')) {
      main.classList.add('enh-scrollable');
    }
  }

  /* ======================================================================
     7. 评论（Giscus）
     ====================================================================== */
  function initComment() {
    var c = E.comment || {};
    if (!c.enable || !c.repo || !c.repoId || !c.categoryId) return;

    // 主题在文章页预留了两个评论挂载点，优先用 #tcomment
    var mount = document.getElementById('tcomment') || document.getElementById('vcomments');
    if (!mount) return;

    var script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.setAttribute('data-repo', c.repo);
    script.setAttribute('data-repo-id', c.repoId);
    script.setAttribute('data-category', c.category);
    script.setAttribute('data-category-id', c.categoryId);
    script.setAttribute('data-mapping', c.mapping || 'pathname');
    script.setAttribute('data-strict', c.strict || '0');
    script.setAttribute('data-reactions-enabled', c.reactions === false ? '0' : '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', c.inputPosition || 'bottom');
    script.setAttribute('data-theme', c.theme || 'preferred_color_scheme');
    script.setAttribute('data-lang', c.lang || 'zh-CN');
    script.setAttribute('crossorigin', 'anonymous');
    mount.appendChild(script);
  }

  /* ====================================================================== */

  function init() {
    initProgress();
    initPostMeta();
    initCodeCopy();
    initLightbox();
    initThemeToggle();
    initHomeScroll();
    initSiteStats();
    initComment();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
