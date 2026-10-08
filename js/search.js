/* ==========================================================================
   Blog Enhance — 本地全站搜索
   不依赖 Algolia，索引来自构建期生成的 search.json
   ========================================================================== */
(function () {
  'use strict';

  var cfg = (window.blogEnhance && window.blogEnhance.search) || {};
  if (cfg.enable === false) return;

  var INDEX_URL = (window.blogEnhance && window.blogEnhance.root || '/') + 'search.json';
  var MAX_SNIPPET = 90;      // 摘要长度
  var MAX_RESULT = 20;       // 最多展示条数

  var index = null;          // 懒加载的索引
  var loading = false;
  var mask, input, body, results = [], active = -1;

  /* ---------- 工具函数 ---------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 转义正则元字符，避免用户输入导致正则异常
  function escapeReg(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 把关键词拆成匹配单元：英文空格分词，中文逐字（2 字以上成词）
  function tokenize(q) {
    var out = [];
    q.trim().split(/\s+/).forEach(function (part) {
      if (!part) return;
      if (/[\u4e00-\u9fa5]/.test(part)) {
        // 中文：整段 + 二元切分
        out.push(part);
        for (var i = 0; i < part.length - 1; i++) out.push(part.substr(i, 2));
      } else {
        out.push(part.toLowerCase());
      }
    });
    return Array.from(new Set(out)).filter(Boolean);
  }

  function highlight(text, tokens) {
    var safe = escapeHtml(text);
    // 只在转义后的文本上做替换，保证输出仍是合法 HTML
    tokens.forEach(function (t) {
      if (t.length < 1) return;
      var re = new RegExp('(' + escapeReg(escapeHtml(t)) + ')', 'gi');
      safe = safe.replace(re, '<mark>$1</mark>');
    });
    return safe;
  }

  // 从正文中截取命中的位置附近作为摘要
  function snippet(content, tokens) {
    var pos = -1;
    var lower = content.toLowerCase();
    for (var i = 0; i < tokens.length; i++) {
      var p = lower.indexOf(tokens[i].toLowerCase());
      if (p > -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos === -1) return content.slice(0, MAX_SNIPPET) + '…';
    var start = Math.max(0, pos - 30);
    var text = (start > 0 ? '…' : '') + content.slice(start, start + MAX_SNIPPET) + '…';
    return text;
  }

  /* ---------- 检索 ---------- */

  function search(q) {
    var tokens = tokenize(q);
    if (!tokens.length || !index) return [];

    var scored = [];
    index.forEach(function (post) {
      var title = post.title || '';
      var content = post.content || '';
      var tags = (post.tags || []).join(' ');
      var cats = (post.categories || []).join(' ');
      var score = 0;

      tokens.forEach(function (t) {
        var lt = t.toLowerCase();
        if (title.toLowerCase().indexOf(lt) > -1) score += 12;
        if (tags.toLowerCase().indexOf(lt) > -1) score += 6;
        if (cats.toLowerCase().indexOf(lt) > -1) score += 5;
        if (content.toLowerCase().indexOf(lt) > -1) score += 2;
      });

      if (score > 0) scored.push({ post: post, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, MAX_RESULT).map(function (s) { return s.post; });
  }

  /* ---------- 渲染 ---------- */

  function render(list, tokens) {
    if (!list.length) {
      body.innerHTML = '<div class="enh-empty">没有找到相关内容，换个关键词试试</div>';
      results = [];
      active = -1;
      return;
    }

    body.innerHTML = list.map(function (p, i) {
      var tags = (p.tags || []).map(function (t) {
        return '<span class="enh-tag">#' + escapeHtml(t) + '</span>';
      }).join('');

      return '<a class="enh-result" data-i="' + i + '" href="' + p.url + '">' +
        '<div class="enh-result-title">' + highlight(p.title, tokens) + '</div>' +
        '<div class="enh-result-desc">' + highlight(snippet(p.content || '', tokens), tokens) + '</div>' +
        '<div class="enh-result-meta">' +
          (p.date ? '<span>' + escapeHtml(p.date) + '</span>' : '') +
          tags +
        '</div>' +
      '</a>';
    }).join('');

    results = Array.prototype.slice.call(body.querySelectorAll('.enh-result'));
    active = 0;
    markActive();
  }

  function markActive() {
    results.forEach(function (el, i) {
      el.classList.toggle('is-active', i === active);
    });
    var cur = results[active];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function run() {
    var q = input.value.trim();
    if (!q) {
      body.innerHTML = '<div class="enh-empty">输入关键词开始搜索</div>';
      results = [];
      return;
    }
    if (!index) { loadIndex(function () { run(); }); return; }
    render(search(q), tokenize(q));
  }

  function loadIndex(cb) {
    if (index) { cb(); return; }
    if (loading) return;
    loading = true;
    body.innerHTML = '<div class="enh-empty">正在加载索引…</div>';

    fetch(INDEX_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = data;
        loading = false;
        cb();
      })
      .catch(function () {
        loading = false;
        body.innerHTML = '<div class="enh-empty">索引加载失败，请刷新页面重试</div>';
      });
  }

  /* ---------- 弹窗控制 ---------- */

  function open() {
    mask.classList.add('is-open');
    input.value = '';
    input.focus();
    if (index) {
      body.innerHTML = '<div class="enh-empty">输入关键词开始搜索</div>';
    } else {
      loadIndex(function () {
        if (input.value.trim()) run();
        else body.innerHTML = '<div class="enh-empty">输入关键词开始搜索</div>';
      });
    }
  }

  function close() {
    mask.classList.remove('is-open');
  }

  function build() {
    mask = document.createElement('div');
    mask.id = 'enh-search-mask';
    mask.innerHTML =
      '<div class="enh-modal">' +
        '<div class="enh-modal-head">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>' +
          '</svg>' +
          '<input id="enh-search-input" type="text" placeholder="搜索文章标题、正文或标签…" autocomplete="off" spellcheck="false">' +
        '</div>' +
        '<div class="enh-modal-body"></div>' +
        '<div class="enh-modal-foot">' +
          '<span><span class="enh-kbd">↑</span><span class="enh-kbd">↓</span> 选择</span>' +
          '<span><span class="enh-kbd">Enter</span> 打开</span>' +
          '<span><span class="enh-kbd">Esc</span> 关闭</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);
    input = mask.querySelector('#enh-search-input');
    body = mask.querySelector('.enh-modal-body');

    input.addEventListener('input', run);

    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.length) { active = (active + 1) % results.length; markActive(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length) { active = (active - 1 + results.length) % results.length; markActive(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[active]) location.href = results[active].getAttribute('href');
      } else if (e.key === 'Escape') {
        close();
      }
    });

    // 点击结果跳转
    body.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.enh-result') : null;
      if (el) { location.href = el.getAttribute('href'); }
    });
  }

  /* ---------- 侧栏搜索入口 ---------- */

  function buildEntry() {
    var header = document.querySelector('#aside-box .header');
    if (!header) return;

    var box = document.createElement('div');
    box.className = 'enh-search';
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    box.innerHTML =
      '<div class="enh-search-box" role="button" tabindex="0">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
          '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>' +
        '</svg>' +
        '<span class="enh-search-ph">搜索</span>' +
        '<span class="enh-kbd">' + (isMac ? '⌘' : 'Ctrl') + '</span>' +
        '<span class="enh-kbd">K</span>' +
      '</div>';

    box.addEventListener('click', open);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });

    header.appendChild(box);
  }

  /* ---------- 快捷键 ---------- */

  function bindHotkey() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        mask.classList.contains('is-open') ? close() : open();
      }
      if (e.key === 'Escape' && mask.classList.contains('is-open')) close();
    });
  }

  function init() {
    build();
    buildEntry();
    bindHotkey();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
