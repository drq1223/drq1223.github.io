/* 首页评论弹幕 —— 从 GitHub Issues（utterances 的评论）匿名拉取后滚动展示。
   设计要点：
   ① 匿名 API 有 60 次/小时/IP 的限额，所以结果进 localStorage 缓存 30 分钟
   ② 拿不到数据就保持隐藏，绝不显示一个空框
   ③ 文本用 textContent 写入，天然免疫 XSS */
(function () {
  var box = document.getElementById("danmakuBox");
  var track = document.getElementById("danmakuTrack");
  if (!box || !track) return;

  var REPO = "drq1223/drq1223.github.io";
  var LABEL = "comment";
  var API = "https://api.github.com/repos/" + REPO;
  var CACHE_KEY = "danmaku_v1";
  var TTL = 30 * 60 * 1000;      // 缓存 30 分钟
  var MAX_ISSUES = 5;            // 最多查 5 个 issue，控制请求数
  var ROW_H = 34, ROWS = 2;

  function clean(s) {
    s = String(s || "");
    s = s.replace(/```[\s\S]*?```/g, " ");        // 去掉代码块
    s = s.replace(/`([^`]*)`/g, "$1");
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");    // 图片
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // 链接只留文字
    s = s.replace(/^\s*[#>\-*+]+\s*/gm, "");       // markdown 标记
    s = s.replace(/\s+/g, " ").trim();
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  }

  function getJSON(url) {
    return fetch(url, { headers: { "Accept": "application/vnd.github+json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); });
  }

  function load() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
    // 注意必须判断 length：空数组 [] 在 JS 里是真值，
    // 只写 cached.items 会把「还没评论时的空结果」当成有效缓存用 30 分钟
    if (cached && Array.isArray(cached.items) && cached.items.length && Date.now() - cached.t < TTL) {
      start(cached.items);
      return;
    }
    getJSON(API + "/issues?labels=" + LABEL + "&state=all&per_page=" + MAX_ISSUES + "&sort=updated&direction=desc")
      .then(function (list) {
        return Promise.all(list.map(function (it) {
          return getJSON(API + "/issues/" + it.number + "/comments?per_page=5")
            .then(function (cs) {
              return cs.map(function (c) {
                return { text: clean(c.body), user: c.user && c.user.login, url: it.html_url };
              });
            })
            .catch(function () { return []; });
        }));
      })
      .then(function (groups) {
        var items = [];
        groups.forEach(function (g) { items = items.concat(g); });
        items = items.filter(function (i) { return i.text && i.text.length > 1; });
        // 空结果不写缓存，否则 30 分钟内即使后来有了评论也刷不出来
        if (items.length) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: items })); } catch (e) {}
          start(items);
        }
      })
      .catch(function () { /* 静默：拉不到就不显示弹幕 */ });
  }

  function spawn(item, top) {
    var el = document.createElement("span");
    el.className = "dm-item";
    el.textContent = item.text;
    if (item.user) {
      var u = document.createElement("i");
      u.className = "dm-user";
      u.textContent = "@" + item.user;
      el.appendChild(u);
    }
    if (item.url) {
      el.title = "点击查看原评论";
      el.style.cursor = "pointer";
      el.addEventListener("click", function () { window.open(item.url, "_blank", "noopener"); });
    }
    el.style.top = top + "px";
    track.appendChild(el);

    var cw = track.clientWidth, ew = el.offsetWidth;
    var dur = Math.max(6000, (cw + ew) / 90 * 1000);      // 约 90px/秒
    var anim = el.animate(
      [{ transform: "translateX(" + cw + "px)" }, { transform: "translateX(" + (-ew) + "px)" }],
      { duration: dur, easing: "linear" }
    );
    anim.onfinish = function () { if (el.parentNode) el.parentNode.removeChild(el); };
  }

  function start(items) {
    if (!items || !items.length) return;      // 没数据就保持隐藏，绝不显示空框
    box.hidden = false;
    var paused = false, idx = 0;
    box.addEventListener("mouseenter", function () { paused = true; });
    box.addEventListener("mouseleave", function () { paused = false; });

    spawn(items[0], 0);
    if (items[1]) setTimeout(function () { spawn(items[1], ROW_H); }, 700);

    setInterval(function () {
      if (paused || document.hidden) return;
      spawn(items[idx++ % items.length], (idx % ROWS) * ROW_H);
    }, 2000);
  }

  load();
})();
