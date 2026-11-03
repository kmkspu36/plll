/* Right-hand results panel + navigation. Display only; no analysis logic here. */
(function (root) {
  "use strict";
  var P = root.PanelLab, D = P.data;
  var TABS = [
    ["all", "전체"], ["code", "코드"], ["ladder", "작화"], ["error", "오류"], ["fix", "수정"], ["files", "첨부"]
  ];
  var TAB_TYPES = {
    all: null, code: ["plc_code"], ladder: ["ladder"], error: ["error_report"], fix: ["correction"],
    files: ["image", "document", "adaptive_card", "structured_json"]
  };
  var TYPE_LABEL = {
    plc_code: "PLC 코드", ladder: "작화", error_report: "오류 검사", correction: "코드 수정",
    image: "이미지", document: "문서", adaptive_card: "Adaptive Card", structured_json: "JSON"
  };
  var DISCLAIMER = "AI 자체 점검 결과입니다. GX Works 컴파일 및 실제 PLC 검증을 대체하지 않습니다.";

  var tab = "all";
  var body = document.getElementById("resultBody");
  var tabsEl = document.getElementById("resultTabs");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function copy(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = "복사됨"; setTimeout(function () { btn.textContent = o; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = "복사 실패"; });
    } else { btn.textContent = "복사 불가"; }
  }

  /* ---------- code rendering ---------- */
  var TOKEN = /(\(\*[\s\S]*?\*\)|\/\/.*|'[^'\n]*')|\b(IF|THEN|ELSE|ELSIF|END_IF|FOR|TO|DO|END_FOR|WHILE|END_WHILE|CASE|OF|END_CASE|VAR|VAR_INPUT|VAR_OUTPUT|END_VAR|PROGRAM|END_PROGRAM|FUNCTION_BLOCK|END_FUNCTION_BLOCK|AND|OR|NOT|TRUE|FALSE|LDI|LDP|LDF|LD|ANDP|ANDF|ANI|ANB|ORB|ORI|OR|OUT|SET|RST|MOV|DMOV|TMR|CNT|MPS|MRD|MPP|PLS|PLF|END)\b|\b([XYMDTCLBWRSV]\d+|K\d+|H[0-9A-F]+)\b|(\b\d+(?:\.\d+)?\b)/gi;

  function highlightInto(parent, line) {
    var last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line))) {
      if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
      var cls = m[1] ? "tk-c" : m[2] ? "tk-k" : m[3] ? "tk-d" : "tk-n";
      parent.appendChild(el("span", cls, m[0]));
      last = m.index + m[0].length;
      if (m[0].length === 0) TOKEN.lastIndex++;
    }
    if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
  }
  function codeView(code) {
    var wrap = el("div", "code");
    code.split("\n").forEach(function (line, i) {
      var row = el("div", "cl");
      row.appendChild(el("span", "ln", String(i + 1)));
      var c = el("span", "lc");
      highlightInto(c, line);
      if (!line) c.appendChild(document.createTextNode(" "));
      row.appendChild(c);
      wrap.appendChild(row);
    });
    return wrap;
  }
  function diffView(before, after) {
    var wrap = el("div", "code diff");
    var bi = 0, ai = 0;
    P.diff.diffLines(before, after).forEach(function (op) {
      var row = el("div", "cl " + op.t);
      var n = op.t === "add" ? ++ai : op.t === "del" ? ++bi : (++bi, ++ai);
      row.appendChild(el("span", "ln", String(n)));
      row.appendChild(el("span", "sign", op.t === "add" ? "+" : op.t === "del" ? "-" : " "));
      var c = el("span", "lc");
      highlightInto(c, op.text);
      if (!op.text) c.appendChild(document.createTextNode(" "));
      row.appendChild(c);
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ---------- ladder ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function parseIL(src) {
    var rungs = [], cur = null;
    var lines = src.split("\n").map(function (l) { return l.replace(/;.*$/, "").trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].split(/\s+/), op = t[0].toUpperCase(), dev = t[1];
      if (op === "END") continue;
      if (op === "LD" || op === "LDI") {
        if (!dev) return null;
        if (!cur || cur.coils.length) { cur = { els: [], coils: [] }; rungs.push(cur); }
        else return null;
        cur.els.push({ main: { neg: op === "LDI", dev: dev }, alts: [] });
      } else if ((op === "OR" || op === "ORI") && cur && dev && !cur.coils.length) {
        cur.els[cur.els.length - 1].alts.push({ neg: op === "ORI", dev: dev });
      } else if ((op === "AND" || op === "ANI") && cur && dev && !cur.coils.length) {
        cur.els.push({ main: { neg: op === "ANI", dev: dev }, alts: [] });
      } else if ((op === "OUT" || op === "SET" || op === "RST") && cur && dev) {
        cur.coils.push({ kind: op, dev: dev });
      } else return null;
    }
    return rungs.length ? rungs : null;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function contact(g, x, y, c) {
    g.appendChild(svg("line", { x1: x, y1: y, x2: x + 22, y2: y }));
    g.appendChild(svg("line", { x1: x + 22, y1: y - 12, x2: x + 22, y2: y + 12 }));
    g.appendChild(svg("line", { x1: x + 38, y1: y - 12, x2: x + 38, y2: y + 12 }));
    g.appendChild(svg("line", { x1: x + 38, y1: y, x2: x + 60, y2: y }));
    if (c.neg) g.appendChild(svg("line", { x1: x + 20, y1: y + 10, x2: x + 40, y2: y - 10 }));
    g.appendChild(svg("text", { x: x + 30, y: y - 18, "text-anchor": "middle" }, c.dev));
  }
  function renderLadder(rungs) {
    var maxW = 0, y0 = 20, H = 0, parts = [];
    rungs.forEach(function (r, idx) {
      var rows = 1;
      r.els.forEach(function (e) { rows = Math.max(rows, 1 + e.alts.length); });
      var w = 30 + r.els.length * 60 + 20 + r.coils.length * 90 + 30;
      maxW = Math.max(maxW, w);
      parts.push({ r: r, y: y0 + 20, rows: rows, idx: idx });
      y0 += rows * 40 + 50;
    });
    H = y0;
    var s = svg("svg", { width: maxW + 40, height: H, viewBox: "0 0 " + (maxW + 40) + " " + H, "class": "ladder-svg" });
    parts.forEach(function (p) {
      var g = svg("g", {}), y = p.y, x = 20, r = p.r;
      g.appendChild(svg("text", { x: 0, y: y - 20, "class": "rn" }, "Rung " + (p.idx + 1)));
      g.appendChild(svg("line", { x1: 20, y1: y - 14, x2: 20, y2: y + p.rows * 40 - 26, "class": "rail" }));
      x = 20;
      r.els.forEach(function (e) {
        contact(g, x, y, e.main);
        e.alts.forEach(function (a, i) {
          var ay = y + (i + 1) * 40;
          g.appendChild(svg("line", { x1: x, y1: y, x2: x, y2: ay }));
          g.appendChild(svg("line", { x1: x + 60, y1: y, x2: x + 60, y2: ay }));
          contact(g, x, ay, a);
        });
        x += 60;
      });
      var end = maxW - r.coils.length * 90 - 10;
      g.appendChild(svg("line", { x1: x, y1: y, x2: Math.max(end, x), y2: y }));
      var cx = Math.max(end, x);
      r.coils.forEach(function (c) {
        g.appendChild(svg("line", { x1: cx, y1: y, x2: cx + 20, y2: y }));
        g.appendChild(svg("circle", { cx: cx + 40, cy: y, r: 14, fill: "none" }));
        g.appendChild(svg("text", { x: cx + 40, y: y + 4, "text-anchor": "middle" }, c.kind === "OUT" ? "" : c.kind === "SET" ? "S" : "R"));
        g.appendChild(svg("text", { x: cx + 40, y: y - 22, "text-anchor": "middle" }, c.dev));
        g.appendChild(svg("line", { x1: cx + 54, y1: y, x2: cx + 70, y2: y }));
        cx += 90;
      });
      g.appendChild(svg("line", { x1: maxW + 10, y1: y - 14, x2: maxW + 10, y2: y + 14, "class": "rail" }));
      s.appendChild(g);
    });
    return s;
  }
  function zoomable(content, label) {
    var box = el("div", "zoom");
    var bar = el("div", "zoom-bar");
    var inner = el("div", "zoom-inner");
    var scale = 1;
    function apply() { inner.style.transform = "scale(" + scale + ")"; lbl.textContent = Math.round(scale * 100) + "%"; }
    var lbl = el("span", "zoom-lbl", "100%");
    [["−", -0.25], ["+", 0.25]].forEach(function (b) {
      var btn = el("button", "btn sm", b[0]);
      btn.type = "button"; btn.setAttribute("aria-label", (b[1] > 0 ? "확대 " : "축소 ") + label);
      btn.onclick = function () { scale = Math.min(4, Math.max(0.25, scale + b[1])); apply(); };
      bar.appendChild(btn);
    });
    var reset = el("button", "btn sm", "100%"); reset.type = "button";
    reset.onclick = function () { scale = 1; apply(); };
    bar.appendChild(reset); bar.appendChild(lbl);
    inner.appendChild(content);
    box.appendChild(bar); box.appendChild(el("div", "zoom-view")).appendChild(inner);
    return box;
  }

  /* ---------- cards ---------- */
  function card(rec, extra) {
    var c = el("article", "card t-" + rec.type);
    var h = el("header", "card-h");
    h.appendChild(el("span", "badge", TYPE_LABEL[rec.type] || rec.type));
    h.appendChild(el("span", "time", fmtTime(rec.receivedAt)));
    var actions = el("span", "card-a");
    h.appendChild(actions);
    c.appendChild(h);
    extra(c, actions);
    return c;
  }
  function note(txt) { return el("p", "note", txt); }
  function copyBtn(getText) {
    var b = el("button", "btn sm", "복사"); b.type = "button";
    b.onclick = function () { copy(getText(), b); };
    return b;
  }
  function previousCode(rec) {
    var list = D.resultsFor(rec.projectId).filter(function (r) { return r.type === "plc_code"; });
    var i = list.indexOf(rec);
    return i > 0 ? list[i - 1] : null;
  }

  function renderRec(rec) {
    var d = rec.data;
    switch (rec.type) {
      case "plc_code":
        return card(rec, function (c, a) {
          var view = codeView(d.code), showing = "code";
          var prev = previousCode(rec);
          if (prev) {
            var cmp = el("button", "btn sm", "이전 코드와 비교"); cmp.type = "button";
            cmp.onclick = function () {
              var nv = showing === "code" ? diffView(prev.data.code, d.code) : codeView(d.code);
              showing = showing === "code" ? "diff" : "code";
              cmp.textContent = showing === "diff" ? "코드만 보기" : "이전 코드와 비교";
              view.replaceWith(nv); view = nv;
            };
            a.appendChild(cmp);
          }
          a.appendChild(copyBtn(function () { return d.code; }));
          c.appendChild(view);
          c.appendChild(note(DISCLAIMER));
        });
      case "ladder":
        return card(rec, function (c, a) {
          var rungs = parseIL(d.source);
          a.appendChild(copyBtn(function () { return d.source; }));
          if (rungs) {
            c.appendChild(zoomable(renderLadder(rungs), "작화"));
            c.appendChild(note("간단한 LD/OR/AND/OUT 니모닉만 도식화합니다. 실제 작화는 GX Works에서 확인하세요."));
          } else {
            c.appendChild(note("도식으로 변환할 수 없는 형식이라 원문을 표시합니다."));
            c.appendChild(codeView(d.source));
          }
          c.appendChild(note(DISCLAIMER));
        });
      case "error_report":
        return card(rec, function (c, a) {
          a.appendChild(copyBtn(function () {
            return d.items.map(function (i) {
              return ["유형: " + i.type, "위치: " + i.location, "원인: " + i.cause, "수정 방법: " + i.fix, "검토 상태: " + (i.status || "AI 자체 점검")].join("\n");
            }).join("\n\n");
          }));
          d.items.forEach(function (i) {
            var dl = el("dl", "err");
            [["오류 유형", i.type], ["오류 위치", i.location], ["원인", i.cause], ["수정 방법", i.fix], ["검토 상태", i.status || "AI 자체 점검 (미검증)"]].forEach(function (kv) {
              dl.appendChild(el("dt", null, kv[0])); dl.appendChild(el("dd", null, kv[1] || "-"));
            });
            c.appendChild(dl);
          });
          c.appendChild(note(DISCLAIMER));
        });
      case "correction":
        return card(rec, function (c, a) {
          a.appendChild(copyBtn(function () { return d.after; }));
          c.appendChild(el("h4", null, "변경 부분 강조"));
          c.appendChild(diffView(d.before, d.after));
          [["수정 전", d.before], ["수정 후", d.after]].forEach(function (p) {
            var det = el("details"); det.appendChild(el("summary", null, p[0] + " 코드"));
            det.appendChild(codeView(p[1])); c.appendChild(det);
          });
          c.appendChild(note(DISCLAIMER));
        });
      case "image":
        return card(rec, function (c) {
          var img = el("img", "att-img"); img.alt = d.name; img.src = d.url; img.referrerPolicy = "no-referrer";
          img.onerror = function () { var m = note("이미지를 불러오지 못했습니다."); img.replaceWith(m); };
          c.appendChild(zoomable(img, "이미지")); c.appendChild(el("p", "fname", d.name));
        });
      case "document":
        return card(rec, function (c) {
          var link = el("a", "doc", d.name); link.href = d.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          c.appendChild(link); c.appendChild(el("p", "fname", d.contentType));
        });
      case "adaptive_card":
        return card(rec, function (c) {
          var texts = [];
          (function walk(n) {
            if (!n || typeof n !== "object") return;
            if (n.type === "TextBlock" && typeof n.text === "string") texts.push(n.text);
            ["body", "items", "columns", "facts"].forEach(function (k) { if (Array.isArray(n[k])) n[k].forEach(walk); });
          })(d.card);
          texts.forEach(function (t) { c.appendChild(el("p", null, t)); });
          var det = el("details"); det.appendChild(el("summary", null, "원본 JSON"));
          det.appendChild(el("pre", "json", JSON.stringify(d.card, null, 2))); c.appendChild(det);
        });
      case "structured_json":
        return card(rec, function (c, a) {
          var s = JSON.stringify(d.value, null, 2);
          a.appendChild(copyBtn(function () { return s; }));
          c.appendChild(el("pre", "json", s));
        });
    }
    return null;
  }

  /* ---------- render ---------- */
  function render() {
    var proj = D.active();
    var all = D.resultsFor(proj.id);
    var types = TAB_TYPES[tab];
    var list = types ? all.filter(function (r) { return types.indexOf(r.type) >= 0; }) : all;
    var query = document.getElementById("resultSearch").value.trim().toLocaleLowerCase();
    if (query) {
      list = list.filter(function (r) {
        return (r.title + " " + r.type + " " + JSON.stringify(r.data)).toLocaleLowerCase().indexOf(query) >= 0;
      });
    }
    body.textContent = "";
    if (!list.length) {
      body.appendChild(el("p", "empty", query ? "검색 결과가 없습니다. 다른 검색어를 입력해 보세요." : "표시할 결과가 없습니다. 에이전트가 코드, 작화, 오류 검사 결과를 보내면 여기에 나타납니다."));
    } else {
      list.slice().reverse().forEach(function (r) { var n = renderRec(r); if (n) body.appendChild(n); });
    }
    TABS.forEach(function (t) {
      var b = tabsEl.querySelector('[data-tab="' + t[0] + '"]');
      var ty = TAB_TYPES[t[0]];
      var n = ty ? all.filter(function (r) { return ty.indexOf(r.type) >= 0; }).length : all.length;
      b.textContent = t[1] + (n ? " " + n : "");
      b.setAttribute("aria-selected", String(t[0] === tab));
    });
    document.getElementById("clearSearch").hidden = !query;
    document.getElementById("clearResults").disabled = all.length === 0;
    document.getElementById("projectName").textContent = proj.name;
    document.getElementById("projectMeta").textContent =
      [proj.vendor || "제조사 미정", proj.software, proj.cpu || "CPU 미정"].join(" · ");
    var sel = document.getElementById("projectSelect");
    sel.textContent = "";
    D.projects().forEach(function (p) {
      var o = el("option", null, p.name); o.value = p.id; o.selected = p.id === proj.id; sel.appendChild(o);
    });
  }

  function setTab(t) { tab = t; render(); }

  TABS.forEach(function (t) {
    var b = el("button", "tab", t[1]); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.tab = t[0];
    b.onclick = function () { setTab(t[0]); };
    tabsEl.appendChild(b);
  });
  document.getElementById("resultSearch").addEventListener("input", render);
  document.getElementById("clearSearch").addEventListener("click", function () {
    var input = document.getElementById("resultSearch");
    input.value = "";
    input.focus();
    render();
  });
  document.getElementById("clearResults").addEventListener("click", function () {
    var proj = D.active();
    if (confirm("현재 프로젝트의 저장된 작업 결과를 모두 삭제할까요? 채팅 내용은 영향받지 않습니다.")) {
      D.clearResults(proj.id);
    }
  });
  D.onChange(render);

  /* ---------- navigation / dialogs ---------- */
  var app = document.getElementById("app");
  function setView(v) {
    app.dataset.view = v;
    document.querySelectorAll(".mtab").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
  }
  var dlg = document.getElementById("dlg"), dlgTitle = document.getElementById("dlgTitle"), dlgBody = document.getElementById("dlgBody");
  function openDialog(title, build) {
    dlgTitle.textContent = title; dlgBody.textContent = ""; build(dlgBody);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  document.getElementById("dlgClose").onclick = function () { dlg.close(); };

  function field(form, label, name, value, type) {
    var l = el("label", "fld"); l.appendChild(el("span", null, label));
    var i = el(type === "select" ? "select" : "input"); i.name = name;
    if (type === "select") {
      ["GX Works3", "GX Works2"].forEach(function (s) { var o = el("option", null, s); o.value = s; o.selected = s === value; i.appendChild(o); });
    } else { i.value = value || ""; }
    l.appendChild(i); form.appendChild(l); return i;
  }
  function projectDialog() {
    openDialog("프로젝트", function (b) {
      var proj = D.active();
      var form = el("form", "form");
      var f = {
        name: field(form, "프로젝트 이름", "name", proj.name),
        vendor: field(form, "PLC 제조사", "vendor", proj.vendor),
        software: field(form, "소프트웨어", "software", proj.software, "select"),
        cpu: field(form, "CPU 모델 (미정이면 비워 두세요)", "cpu", proj.cpu)
      };
      var row = el("div", "row");
      var save = el("button", "btn primary", "저장"); save.type = "submit";
      var add = el("button", "btn", "새 프로젝트로 추가"); add.type = "button";
      function vals() { return { name: f.name.value, vendor: f.vendor.value, software: f.software.value, cpu: f.cpu.value }; }
      form.onsubmit = function (e) { e.preventDefault(); D.updateProject(proj.id, vals()); dlg.close(); };
      add.onclick = function () { D.addProject(vals()); dlg.close(); };
      row.appendChild(save); row.appendChild(add); form.appendChild(row); b.appendChild(form);
      var clr = el("button", "btn danger", "이 프로젝트의 작업 결과 삭제"); clr.type = "button";
      clr.onclick = function () { if (confirm("이 프로젝트의 저장된 작업 결과를 삭제할까요? 채팅 내용은 영향받지 않습니다.")) { D.clearResults(proj.id); dlg.close(); } };
      b.appendChild(clr);
    });
  }
  function historyDialog() {
    openDialog("작업 기록", function (b) {
      var items = D.historyFor(D.active().id);
      if (!items.length) { b.appendChild(el("p", "empty", "아직 기록이 없습니다. (사용자 요청 기록은 이 탭을 닫으면 초기화됩니다.)")); return; }
      var ul = el("ul", "hist");
      items.forEach(function (h) {
        var li = el("li"); li.appendChild(el("span", "time", fmtTime(h.time)));
        li.appendChild(el("span", "badge " + h.kind, h.kind === "user" ? "요청" : "결과"));
        li.appendChild(el("span", null, h.text)); ul.appendChild(li);
      });
      b.appendChild(ul);
    });
  }
  function settingsDialog() {
    openDialog("설정 / 상태", function (b) {
      [
        "연결: 기존 Copilot Studio 통합운영 에이전트 1개 (Direct Line 토큰 broker 방식).",
        "브라우저에는 Direct Line Secret이 없으며, broker가 발급한 단기 토큰만 사용합니다.",
        "프로젝트와 작업 결과는 이 브라우저(localStorage)에만 저장됩니다. 채팅 기록은 Web Chat/에이전트가 관리합니다.",
        DISCLAIMER
      ].forEach(function (t) { b.appendChild(el("p", null, t)); });
    });
  }

  var NAV = {
    home: function () { setView("chat"); },
    work: function () { setView("chat"); },
    draw: function () { setTab("ladder"); setView("results"); },
    check: function () { setTab("error"); setView("results"); },
    code: function () { setTab("code"); setView("results"); },
    blueprint: function () { setTab("files"); setView("results"); },
    project: projectDialog, history: historyDialog, settings: settingsDialog
  };
  document.querySelectorAll("[data-nav]").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("[data-nav]").forEach(function (x) { x.removeAttribute("aria-current"); });
      b.setAttribute("aria-current", "page");
      NAV[b.dataset.nav]();
    };
  });
  document.querySelectorAll(".mtab").forEach(function (b) { b.onclick = function () { setView(b.dataset.view); }; });
  document.getElementById("projectSelect").onchange = function (e) { D.setActive(e.target.value); };
  document.getElementById("editProject").onclick = projectDialog;

  setView("chat");
  render();
  P.connect();
})(window);
