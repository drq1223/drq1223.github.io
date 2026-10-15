(function () {
  var REPO = "drq1223/drq1223.github.io";
  var MAIL = "drq12231223@gmail.com";
  // 必须带上 template 参数：仓库里一旦存在 issue 模板，不带 template 的
  // /issues/new 会被 GitHub 拦到「模板选择页」，title/body/labels 全部丢失。
  var TEMPLATE = "friend-link.md";

  var form = document.getElementById("sl-form");
  if (!form) return;
  var tip = document.getElementById("sl-tip");

  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function normUrl(u) {
    if (!u) return "";
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  }
  function buildBody() {
    return [
      "### 友链申请",
      "",
      "- **网站名称**：" + val("sl-name"),
      "- **网站地址**：" + normUrl(val("sl-url")),
      "- **一句话简介**：" + val("sl-desc"),
      "- **图标地址**：" + (val("sl-icon") || "（未填，用名称首字当头像）"),
      "- **联系方式**：" + (val("sl-mail") || "（未填）"),
      "",
      "---",
      "提交自博客「申请友链」表单（/submit-link/）"
    ].join("\n");
  }
  function show(msg, bad) {
    if (!tip) return;
    tip.textContent = msg;
    tip.className = "sl-tip " + (bad ? "bad" : "ok");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = val("sl-name"), url = normUrl(val("sl-url")), desc = val("sl-desc");
    if (!name || !url || !desc) { show("网站名称、网址、简介这三项是必填的", true); return; }
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) {
      show("网址看起来不对，请填完整的 http(s) 链接", true);
      return;
    }
    var url2 = "https://github.com/" + REPO + "/issues/new"
      + "?template=" + TEMPLATE
      + "&title=" + encodeURIComponent("[友链申请] " + name)
      + "&body=" + encodeURIComponent(buildBody())
      + "&labels=friend-link";
    window.open(url2, "_blank", "noopener");
    show("已在新标签打开 GitHub 提交页，检查后点 Submit new issue 即可。", false);
  });

  var mailBtn = document.getElementById("sl-mailbtn");
  if (mailBtn) {
    mailBtn.addEventListener("click", function () {
      var name = val("sl-name");
      if (!name || !val("sl-url") || !val("sl-desc")) {
        show("邮件也要先填好名称、网址、简介哦", true);
        return;
      }
      window.location.href = "mailto:" + MAIL
        + "?subject=" + encodeURIComponent("[友链申请] " + name)
        + "&body=" + encodeURIComponent(buildBody());
    });
  }

  /* 兜底正文框：GitHub 若把预填内容拦到模板选择页后面，
     访客可以自己选模板然后把这段粘进去。内容跟着输入实时更新。 */
  var bodyBox = document.getElementById("sl-body");
  function syncBody() { if (bodyBox) bodyBox.value = buildBody(); }
  if (bodyBox) {
    ["sl-name", "sl-url", "sl-desc", "sl-icon", "sl-mail"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", syncBody);
    });
    syncBody();
  }
  var copyBtn = document.getElementById("sl-copy");
  var copyTip = document.getElementById("sl-copytip");
  if (copyBtn && bodyBox) {
    copyBtn.addEventListener("click", function () {
      bodyBox.select();
      bodyBox.setSelectionRange(0, 999999);
      var done = function () {
        if (!copyTip) return;
        copyTip.textContent = "已复制";
        setTimeout(function () { copyTip.textContent = ""; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(bodyBox.value).then(done, function () {
          try { document.execCommand("copy"); done(); } catch (e) {}
        });
      } else {
        try { document.execCommand("copy"); done(); } catch (e) {}
      }
    });
  }
})();
