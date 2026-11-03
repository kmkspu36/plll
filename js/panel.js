/* Right-hand results panel + navigation. Display only; no analysis logic here. */
(function (root) {
  "use strict";
  var P = root.PanelLab, D = P.data;
  var TABS = [
    ["all", "전체"], ["ladder", "PLC 작화"], ["code", "코드"], ["error", "오류"], ["fix", "수정"], ["verify", "검증"], ["report", "보고서"], ["files", "첨부"], ["raw", "원문"]
  ];
  var TAB_TYPES = {
    all: null, code: ["plc_code"], ladder: ["ladder"], error: ["error_report"], fix: ["correction"],
    files: ["image", "document", "adaptive_card", "structured_json"], raw: ["raw_response"], verify: [], report: []
  };
  var TYPE_LABEL = {
    plc_code: "PLC 코드", ladder: "작화", error_report: "오류 검사", correction: "코드 수정",
    image: "이미지", document: "문서", adaptive_card: "Adaptive Card", structured_json: "JSON", raw_response: "선택한 원문"
  };
  var DISCLAIMER = "기존 에이전트의 응답을 표시한 결과입니다. GX Works 컴파일 및 실제 PLC 검증을 대체하지 않습니다.";

  var tab = "all";
  var startedConversations = new Set();
  var body = document.getElementById("resultBody");
  var tabsEl = document.getElementById("resultTabs");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function download(text, name, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime || "text/plain;charset=utf-8" }));
    var a = el("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function notify(message) {
    document.getElementById("noticeText").textContent = message;
    document.getElementById("notice").hidden = false;
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
    var operations;
    try { operations = P.diff.diffLines(before, after); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return note(error.message);
    }
    operations.forEach(function (op) {
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
      g.appendChild(svg("line", { x1: cx - 20, y1: y, x2: maxW + 10, y2: y }));
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
    function apply() { inner.style.zoom = String(scale); lbl.textContent = Math.round(scale * 100) + "%"; }
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
    var content = el("div", "card-content");
    c.appendChild(content);
    if (rec.type !== "raw_response") content.appendChild(note("응답 형식의 자동 분류는 실제 에이전트에서 미검증 상태입니다. AI 원본 응답과 함께 확인하세요."));
    extra(content, actions);
    var collapse = el("button", "btn sm", "접기"); collapse.type = "button"; collapse.setAttribute("aria-expanded", "true");
    collapse.onclick = function () {
      content.hidden = !content.hidden; collapse.textContent = content.hidden ? "펼치기" : "접기";
      collapse.setAttribute("aria-expanded", String(!content.hidden));
    };
    actions.appendChild(collapse);
    var expand = el("button", "btn sm", "전체 화면"); expand.type = "button"; expand.dataset.expand = "true";
    expand.onclick = function () { showResult(rec); };
    actions.appendChild(expand);
    var save = el("button", "btn sm", "파일 저장"); save.type = "button";
    save.onclick = function () {
      var text = rec.type === "plc_code" ? rec.data.code : rec.type === "ladder" ? rec.data.source : JSON.stringify(rec, null, 2);
      download(text, "panellab-" + rec.type + (rec.type === "plc_code" || rec.type === "ladder" ? ".txt" : ".json"));
    };
    actions.appendChild(save);
    var classify = el("details", "result-classify");
    classify.appendChild(el("summary", null, rec.task ? "작업 단계: " + D.taskLabels[rec.task] : "작업 단계에 결과 연결"));
    var classifyRow = el("div", "row");
    var taskSelect = el("select"); taskSelect.setAttribute("aria-label", "결과의 작업 단계");
    Object.keys(D.taskLabels).forEach(function (task) {
      var option = el("option", null, D.taskLabels[task]); option.value = task;
      option.selected = rec.task === task; taskSelect.appendChild(option);
    });
    var assign = el("button", "btn sm", "이 단계에 연결"); assign.type = "button";
    assign.onclick = function () {
      D.assignTask(rec.key, taskSelect.value);
      var viewer = document.getElementById("resultViewer"); if (viewer.open) viewer.close();
    };
    classifyRow.appendChild(taskSelect); classifyRow.appendChild(assign); classify.appendChild(classifyRow);
    classify.appendChild(note("사용자의 분류입니다. AI 완료·컴파일·실장비 검증을 뜻하지 않습니다."));
    content.appendChild(classify);
    var raw = el("details");
    raw.appendChild(el("summary", null, "AI 원본 응답"));
    if (rec.original) {
      raw.appendChild(el("pre", "raw-text", rec.original.text || "(텍스트 없음 · 아래 Activity 원본 확인)"));
      raw.appendChild(el("pre", "json", JSON.stringify(rec.original, null, 2)));
    } else {
      raw.appendChild(note("이전 버전에서 저장한 결과에는 원본 Activity가 없습니다. 추출 결과만 보존되어 있습니다."));
    }
    content.appendChild(raw);
    if (rec.type === "raw_response") {
      var follow = el("div", "row result-followup");
      [["draw", "래더 요청"], ["code", "코드 생성"], ["check", "오류 검토"], ["fix", "수정 요청"], ["io", "I/O 정리"], ["explain", "추가 설명"]].forEach(function (item) {
        var b = el("button", "btn sm", item[1]); b.type = "button";
        b.onclick = function () {
          var current = P.conversations.active();
          if (!current || current.id !== rec.conversationId || current.projectId !== rec.projectId) {
            notify("이 원문은 다른 대화의 기록입니다. 새 요청에 포함할 정보를 직접 확인해 주세요.");
          }
          document.getElementById("resultViewer").close();
          requestDialog(item[0], rec.data.text);
        };
        follow.appendChild(b);
      });
      content.appendChild(follow);
      content.appendChild(note("후속 요청에는 선택한 응답의 텍스트만 포함됩니다. 이전 이미지가 새 대화로 자동 전달되지는 않습니다."));
    }
    return c;
  }
  function showResult(rec) {
    var viewer = document.getElementById("resultViewer"), container = document.getElementById("resultViewerBody");
    container.textContent = "";
    var rendered = renderRec(rec);
    if (!rendered) { notify("이 결과 형식을 표시할 수 없습니다. 원본을 확인하세요."); return; }
    rendered.querySelectorAll("[data-expand]").forEach(function (button) { button.remove(); });
    document.getElementById("resultViewerTitle").textContent = TYPE_LABEL[rec.type] || "작업 결과";
    container.appendChild(rendered);
    viewer.showModal();
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
          var searchLabel = el("label", "code-search");
          searchLabel.appendChild(el("span", null, "코드 검색"));
          var search = el("input"); search.type = "search"; search.placeholder = "주소·명령어 검색"; search.setAttribute("aria-label", "코드 내 주소 또는 명령어 검색");
          search.oninput = function () {
            var query = search.value.toLocaleLowerCase();
            view.querySelectorAll(".cl").forEach(function (row) { row.hidden = !!query && row.querySelector(".lc").textContent.toLocaleLowerCase().indexOf(query) < 0; });
          };
          searchLabel.appendChild(search); c.appendChild(searchLabel);
          c.appendChild(el("p", "small", "프로젝트의 보존 코드 결과 · " + fmtTime(rec.receivedAt) + " · GX Works 버전 관리는 아님"));
          var prev = previousCode(rec);
          if (prev) {
            var cmp = el("button", "btn sm", "이전 코드와 비교"); cmp.type = "button";
            cmp.onclick = function () {
              var nv = showing === "code" ? diffView(prev.data.code, d.code) : codeView(d.code);
              showing = showing === "code" ? "diff" : "code";
              cmp.textContent = showing === "diff" ? "코드만 보기" : "이전 코드와 비교";
              view.replaceWith(nv); view = nv;
              search.oninput();
            };
            a.appendChild(cmp);
          }
          a.appendChild(copyBtn(function () { return d.code; }));
          c.appendChild(view);
          c.appendChild(note(DISCLAIMER));
        });
      case "ladder":
        return card(rec, function (c, a) {
          var rungs = P.ladder.parseIL(d.source);
          a.appendChild(copyBtn(function () { return d.source; }));
          if (rungs) {
            var diagram = renderLadder(rungs);
            c.appendChild(zoomable(diagram, "작화"));
            var exportSvg = el("button", "btn sm", "SVG 저장"); exportSvg.type = "button";
            exportSvg.onclick = function () {
              var clone = diagram.cloneNode(true);
              clone.setAttribute("xmlns", SVGNS);
              clone.setAttribute("style", "background:#101b2c;font:12px monospace");
              clone.querySelectorAll("line,circle").forEach(function (shape) { shape.setAttribute("stroke", "#bcd3f2"); shape.setAttribute("stroke-width", "2"); });
              clone.querySelectorAll("text").forEach(function (text) { text.setAttribute("fill", "#d7e5fa"); });
              download(new XMLSerializer().serializeToString(clone), "panellab-ladder.svg", "image/svg+xml");
            };
            a.appendChild(exportSvg);
            c.appendChild(note("직렬 접점 LD/LDI/AND/ANI와 단일 OUT/SET/RST만 표시합니다. 주소·명령어 호환성과 실제 작화는 GX Works에서 확인하세요."));
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
              return ["유형: " + i.type, "위치: " + i.location, "원인: " + i.cause, "수정 방법: " + i.fix, "검토 상태: " + (i.status || "응답에 검토 상태 없음")].join("\n");
            }).join("\n\n");
          }));
          d.items.forEach(function (i) {
            var dl = el("dl", "err");
            [["오류 유형", i.type], ["오류 위치", i.location], ["원인", i.cause], ["수정 방법", i.fix], ["검토 상태", i.status || "응답에 검토 상태 없음"]].forEach(function (kv) {
              dl.appendChild(el("dt", null, kv[0])); dl.appendChild(el("dd", null, kv[1] || "-"));
            });
            c.appendChild(dl);
          });
          c.appendChild(note(DISCLAIMER));
        });
      case "correction":
        return card(rec, function (c, a) {
          var proposalCopy = copyBtn(function () { return d.after; });
          proposalCopy.textContent = "수정안 복사";
          a.appendChild(proposalCopy);
          var approve = el("button", "btn sm primary", rec.approval === "approved" ? "승인됨" : "수정안 승인");
          approve.type = "button"; approve.disabled = rec.approval === "approved";
          approve.onclick = function () {
            if (confirm("수정안을 이 프로젝트의 브라우저 작업본으로 반영할까요? 원본은 보존되며 PLC 장비에는 전송하지 않습니다.")) {
              D.approve(rec.key);
              var viewer = document.getElementById("resultViewer");
              if (viewer.open) viewer.close();
            }
          };
          a.appendChild(approve);
          c.appendChild(note(rec.approval === "approved" ? "사용자가 승인한 브라우저 작업본입니다. PLC에 적용되지 않았습니다." :
            "미승인 수정 제안입니다. 승인 전에는 현재 작업본에 반영하지 않습니다. 수정 이유는 AI 원본 응답을 확인하세요."));
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
      case "raw_response":
        return card(rec, function (c, a) {
          a.appendChild(copyBtn(function () { return d.text; }));
          c.appendChild(el("pre", "raw-text", d.text || "(텍스트 없음 · AI 원본 응답의 첨부 정보를 확인하세요.)"));
          c.appendChild(note("사용자가 선택한 에이전트 원문입니다. 이미지 분석 완료나 오류 판정으로 자동 분류하지 않았습니다."));
        });
    }
    return null;
  }

  /* ---------- render ---------- */
  function render() {
    var proj = D.active();
    var all = D.resultsFor(proj.id);
    var types = TAB_TYPES[tab];
    var list = tab === "verify" || tab === "report" ? all.filter(function (r) { return r.task === tab; }) :
      types ? all.filter(function (r) { return types.indexOf(r.type) >= 0; }) : all;
    var taskFilter = document.getElementById("resultTaskFilter").value;
    if (taskFilter) list = list.filter(function (r) { return r.task === taskFilter; });
    var query = document.getElementById("resultSearch").value.trim().toLocaleLowerCase();
    if (query) {
      list = list.filter(function (r) {
        return (r.title + " " + r.type + " " + JSON.stringify(r.data)).toLocaleLowerCase().indexOf(query) >= 0;
      });
    }
    body.textContent = "";
    if (!list.length) {
      body.appendChild(el("p", "empty", query || taskFilter ? "조건에 맞는 결과가 없습니다. 검색어와 작업 단계 필터를 확인하세요." :
        tab === "verify" || tab === "report" ? "이 단계에 연결된 실제 응답이 없습니다. 대화 원문을 결과로 보관한 후 작업 단계에 연결하세요. 완료 여부를 임의로 판정하지 않습니다." :
        "아직 생성된 결과가 없습니다. AGENT 01의 실제 코드·작화·검사 응답을 이곳에서 확인할 수 있습니다."));
    } else {
      list.slice().reverse().forEach(function (r) { var n = renderRec(r); if (n) body.appendChild(n); });
    }
    TABS.forEach(function (t) {
      var b = tabsEl.querySelector('[data-tab="' + t[0] + '"]');
      var ty = TAB_TYPES[t[0]];
      var n = t[0] === "verify" || t[0] === "report" ? all.filter(function (r) { return r.task === t[0]; }).length :
        ty ? all.filter(function (r) { return ty.indexOf(r.type) >= 0; }).length : all.length;
      b.textContent = t[1] + (n ? " " + n : "");
      b.setAttribute("aria-selected", String(t[0] === tab));
      b.tabIndex = t[0] === tab ? 0 : -1;
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
  document.getElementById("resultTaskFilter").addEventListener("change", render);
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
  function updateViewport() {
    var viewport = root.visualViewport;
    if (viewport && viewport.scale !== 1) return;
    if (viewport && root.innerWidth <= 720) {
      app.style.setProperty("--workspace-height", viewport.height + "px");
      app.style.setProperty("--workspace-top", viewport.offsetTop + "px");
    } else {
      app.style.removeProperty("--workspace-height");
      app.style.removeProperty("--workspace-top");
    }
  }
  root.addEventListener("resize", updateViewport);
  if (root.visualViewport) {
    root.visualViewport.addEventListener("resize", updateViewport);
    root.visualViewport.addEventListener("scroll", updateViewport);
  }
  updateViewport();
  function setView(v) {
    if (v !== "menu") {
      app.dataset.page = "chat";
      document.getElementById("dashboard").hidden = true;
      document.getElementById("pageTitle").textContent = "AI 엔지니어링 작업실";
      document.getElementById("mobileDashboard").setAttribute("aria-pressed", "false");
      document.querySelectorAll("[data-nav]").forEach(function (button) { button.removeAttribute("aria-current"); });
      document.querySelector('[data-nav="' + (v === "results" ? "saved" : "home") + '"]').setAttribute("aria-current", "page");
    }
    if (v === "results") setResults(true);
    app.dataset.view = v;
    document.querySelectorAll(".mtab").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
  }
  function dashboard() {
    setResults(false); setView("chat");
    app.dataset.page = "dashboard";
    document.getElementById("dashboard").hidden = false;
    document.getElementById("pageTitle").textContent = "PanelLab | PLC Engineering AI";
    document.querySelectorAll("[data-nav]").forEach(function (button) { button.removeAttribute("aria-current"); });
    document.querySelector('[data-nav="dashboard"]').setAttribute("aria-current", "page");
    document.querySelectorAll(".mtab").forEach(function (button) { button.setAttribute("aria-pressed", String(button.id === "mobileDashboard")); });
  }
  function setResults(open) {
    app.dataset.results = open ? "open" : "closed";
    document.getElementById("resultsPanel").hidden = !open;
    var toggle = document.getElementById("toggleResults");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "결과 닫기" : "결과 열기";
    if (!open && app.dataset.view === "results") setView("chat");
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
  function projectDialog(newProject) {
    var creating = newProject === true;
    openDialog(creating ? "새 프로젝트" : "프로젝트 관리", function (b) {
      var proj = creating ? { name: "", vendor: "Mitsubishi", software: "GX Works3", cpu: "", description: "", status: "unclassified" } : D.active();
      var form = el("form", "form");
      var f = {
        name: field(form, "프로젝트 이름", "name", proj.name),
        vendor: field(form, "PLC 제조사", "vendor", proj.vendor),
        software: field(form, "소프트웨어", "software", proj.software, "select"),
        cpu: field(form, "CPU 모델 (미정이면 비워 두세요)", "cpu", proj.cpu),
        description: field(form, "프로젝트 설명", "description", proj.description)
      };
      var stateLabel = el("label", "fld"); stateLabel.appendChild(el("span", null, "프로젝트 상태 (사용자 지정 · AI 검증 상태와 별개)"));
      var state = el("select"); state.name = "status";
      Object.keys(D.statusLabels).forEach(function (key) { var option = el("option", null, D.statusLabels[key]); option.value = key; option.selected = (proj.status || "unclassified") === key; state.appendChild(option); });
      stateLabel.appendChild(state); form.appendChild(stateLabel);
      if (!creating) b.appendChild(note("생성: " + new Date(proj.createdAt).toLocaleString("ko-KR") + " / 마지막 기록: " +
        (proj.updatedAt ? new Date(proj.updatedAt).toLocaleString("ko-KR") : "기록 없음")));
      var row = el("div", "row");
      var save = el("button", "btn primary", creating ? "프로젝트 생성" : "저장"); save.type = "submit";
      var add = el("button", "btn", "새 프로젝트로 추가"); add.type = "button";
      function vals() { return { name: f.name.value, vendor: f.vendor.value, software: f.software.value, cpu: f.cpu.value, description: f.description.value, status: state.value }; }
      form.onsubmit = function (e) { e.preventDefault(); if (creating) D.addProject(vals()); else D.updateProject(proj.id, vals()); dlg.close(); };
      add.onclick = function () { D.addProject(vals()); dlg.close(); };
      row.appendChild(save); if (!creating) row.appendChild(add); form.appendChild(row); b.appendChild(form);
      if (proj.workingCopy) {
        var working = el("details"); working.appendChild(el("summary", null, "승인된 브라우저 작업본"));
        working.appendChild(codeView(proj.workingCopy.code));
        working.appendChild(copyBtn(function () { return proj.workingCopy.code; }));
        b.appendChild(working);
        b.appendChild(note("브라우저 작업본이며 GX Works 또는 PLC에 자동 반영되지 않습니다."));
      }
      if (creating) return;
      var files = el("button", "btn", "현재 프로젝트의 보관한 이미지"); files.type = "button";
      files.onclick = function () { dlg.close(); filesDialog(); }; b.appendChild(files);
      var clr = el("button", "btn danger", "이 프로젝트의 작업 결과 삭제"); clr.type = "button";
      clr.onclick = function () { if (confirm("이 프로젝트의 저장된 작업 결과를 삭제할까요? 채팅 내용은 영향받지 않습니다.")) { D.clearResults(proj.id); dlg.close(); } };
      b.appendChild(clr);
    });
  }
  function historyDialog() {
    openDialog("작업 기록", function (b) {
      var items = D.historyFor(D.active().id);
      if (!items.length) { b.appendChild(el("p", "empty", "아직 기록이 없습니다. 보존된 대화와 결과에서 이력을 표시합니다.")); return; }
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
        "서버가 기존 Broker의 인증값을 관리하고 브라우저에는 단기 토큰만 전달합니다. 서버 설정과 호스팅 로그인이 필요합니다.",
        "프로젝트·결과·대화 원본은 localStorage, 선택하여 보관한 이미지 원본은 IndexedDB에 저장됩니다. 모두 이 브라우저에만 있으며 다른 기기에 동기화되지 않습니다.",
        "최근 대화는 읽기 전용 기록입니다. 새 대화와 재연결은 새 서버 대화를 시작하며 이전 대화를 자동으로 재개하지 않습니다.",
        "이미지는 선택·미리보기·로컬 보관이 가능합니다. 기존 에이전트의 파일 입력을 운영자가 검증하고 서버에서 활성화하기 전에는 업로드할 수 없습니다. 일반 파일은 아직 미지원입니다.",
        "이전에 공개된 Broker 인증값은 서버 소유자가 폐기·교체해야 합니다. 저장소에서 제거하는 것만으로 무효화되지 않습니다.",
        DISCLAIMER
      ].forEach(function (t) { b.appendChild(el("p", null, t)); });
      if (P.connectionMessage) b.appendChild(note("현재 연결 진단: " + P.connectionMessage));
      b.appendChild(note("GitHub Pages는 토큰 서버를 실행하지 못합니다. 로컬 실행: npm run dev --prefix .\\api. 인증값은 api\\local.settings.json 또는 서버 환경에서만 관리하세요."));
      var login = el("a", "doc", "배포 사이트 로그인");
      login.href = "/.auth/login/github";
      b.appendChild(note("아래 링크는 Azure Static Web Apps의 GitHub 로그인이 구성된 배포에서 사용합니다. 호스팅 공급자 설정은 별도로 필요합니다."));
      b.appendChild(login);
      var exportAll = el("button", "btn", "현재 프로젝트 기록 내보내기");
      exportAll.type = "button";
      exportAll.onclick = function () {
        var project = D.active();
        download(JSON.stringify({ project: project, results: D.resultsFor(project.id), conversations: P.conversations.forProject(project.id) }, null, 2),
          "panellab-project.json", "application/json");
      };
      b.appendChild(el("p")).appendChild(exportAll);
      var backup = el("button", "btn", "기존 데이터의 IndexedDB 백업 만들기"); backup.type = "button";
      backup.onclick = async function () {
        backup.disabled = true;
        try {
          var snapshot = await P.storage.backupLegacy();
          backup.textContent = "백업 완료 · " + new Date(snapshot.createdAt).toLocaleTimeString("ko-KR");
          download(JSON.stringify(snapshot, null, 2), "panellab-local-backup.json", "application/json");
        } catch (error) { notify("백업 실패: " + error.message); }
        finally { backup.disabled = false; }
      };
      b.appendChild(el("p")).appendChild(backup);
      b.appendChild(note("백업은 기존 localStorage를 삭제하거나 대체하지 않습니다. 내보내기 JSON에 이미지 원본은 포함되지 않으므로 보관한 이미지에서 개별 저장하세요."));
    });
  }

  var NAV = {
    dashboard: dashboard,
    home: function () { setView("chat"); },
    saved: function () { setTab("all"); setView("results"); },
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
  document.getElementById("toggleResults").onclick = function () {
    var open = app.dataset.results !== "open";
    setResults(open);
    if (open) setView("results");
  };
  document.getElementById("closeResults").onclick = function () {
    setResults(false);
    document.getElementById("toggleResults").focus();
  };
  document.getElementById("dismissNotice").onclick = function () { document.getElementById("notice").hidden = true; };
  root.addEventListener("panellab:error", function (event) { notify(event.detail); });
  root.addEventListener("panellab:send", function (event) {
    var current = P.conversations.active(), detail = event.detail;
    if (!current || detail.conversationId !== current.id || current.projectId !== D.active().id) return;
    if (detail.state === "sending") {
      startedConversations.add(current.id);
      document.getElementById("welcome").hidden = true;
    }
    if (!P.connected) return;
    var status = document.getElementById("sendStatus");
    status.textContent = detail.message;
    status.dataset.state = detail.state;
  });
  document.getElementById("connectionHelp").onclick = settingsDialog;
  document.getElementById("savedImages").onclick = filesDialog;
  document.getElementById("resultViewerClose").onclick = function () { document.getElementById("resultViewer").close(); };
  root.addEventListener("panellab:result", function (event) {
    if (event.detail.projectId === D.active().id && app.dataset.page !== "dashboard") {
      setResults(true);
      if (app.dataset.view === "menu") setView("chat");
    }
  });
  tabsEl.addEventListener("keydown", function (event) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
    event.preventDefault();
    var index = TABS.findIndex(function (t) { return t[0] === tab; });
    index = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[index][0]);
    tabsEl.querySelector('[data-tab="' + tab + '"]').focus();
  });

  function archiveDialog(conversation) {
    openDialog(conversation.title, function (container) {
      container.appendChild(note("로컬에 보존된 읽기 전용 대화입니다. 서버 대화 재개가 아닙니다. 원본 Activity에는 첨부 정보도 포함됩니다."));
      var save = el("button", "btn", "대화 원본 저장"); save.type = "button";
      save.onclick = function () { download(JSON.stringify(conversation, null, 2), "panellab-conversation.json", "application/json"); };
      container.appendChild(save);
      conversation.activities.forEach(function (entry) {
        var item = el("article", "archive-item");
        item.appendChild(el("span", "badge", entry.direction === "outgoing" ? "사용자" : "기존 에이전트"));
        item.appendChild(el("p", null, entry.activity.text || "(첨부 또는 텍스트 없는 메시지)"));
        var raw = el("details"); raw.appendChild(el("summary", null, "Activity 원본"));
        raw.appendChild(el("pre", "json", JSON.stringify(entry.activity, null, 2)));
        item.appendChild(raw); container.appendChild(item);
        if (entry.direction === "incoming") {
          var result = el("button", "btn sm", "이 원문을 결과로 보관"); result.type = "button";
          result.onclick = function () {
            D.addResult(entry.activity.id || entry.key, 0, {
              type: "raw_response", title: "선택한 에이전트 원문", data: { text: entry.activity.text || "" }
            }, conversation, entry.activity);
            if (D.active().id === conversation.projectId) { setResults(true); setTab("raw"); setView("results"); }
            dlg.close();
          };
          item.appendChild(result);
        }
      });
    });
  }
  function filesDialog() {
    var projectId = D.active().id, previewUrls = [], disposed = false;
    openDialog("보관한 이미지 · 현재 브라우저", function (container) {
      container.appendChild(note("직접 보관한 원본 파일입니다. 로컬 보관 여부와 에이전트 전송·분석 여부는 서로 다릅니다."));
      var list = el("div", "stored-images"); container.appendChild(list);
      list.appendChild(el("p", "small", "파일 저장소를 읽고 있습니다..."));
      P.storage.filesFor(projectId).then(function (records) {
        if (disposed) return;
        list.textContent = "";
        if (!records.length) list.appendChild(el("p", "empty", "보관한 이미지가 없습니다. 이미지 첨부에서 로컬 보관을 선택하세요."));
        records.slice().reverse().forEach(function (record) {
          var c = el("article", "archive-item");
          var img = el("img", "stored-image"); img.alt = record.name;
          img.src = URL.createObjectURL(record.blob); previewUrls.push(img.src);
          c.appendChild(img); c.appendChild(el("p", "fname", record.name + " · " + Math.ceil(record.blob.size / 1024) + "KB"));
          c.appendChild(el("p", "small", "이 브라우저 원본 보관 · 전송·분석 상태는 대화에서 확인"));
          var row = el("div", "row");
          var save = el("button", "btn sm", "원본 파일 저장"); save.type = "button";
          save.onclick = function () { download(record.blob, record.name, record.blob.type); };
          var use = el("button", "btn sm", "이 이미지로 요청 준비"); use.type = "button";
          use.onclick = async function () {
            dlg.close();
            try { await P.attachments.useSaved(record); }
            catch (error) { notify(error.message); }
          };
          var remove = el("button", "btn sm danger", "보관 삭제"); remove.type = "button";
          remove.onclick = async function () {
            if (!confirm("이 브라우저에 보관한 이미지 원본을 삭제할까요? 이미 전송한 서버 첨부와 대화 기록은 삭제되지 않습니다.")) return;
            remove.disabled = true;
            try { await P.storage.removeFile(record.id); c.remove(); if (!list.children.length) list.appendChild(el("p", "empty", "보관한 이미지가 없습니다.")); }
            catch (error) { notify(error.message); remove.disabled = false; }
          };
          row.appendChild(save); row.appendChild(use); row.appendChild(remove); c.appendChild(row); list.appendChild(c);
        });
      }).catch(function (error) { if (!disposed) { list.textContent = ""; list.appendChild(note(error.message)); } });
    });
    dlg.addEventListener("close", function () {
      disposed = true; previewUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    }, { once: true });
  }
  function renderConversations() {
    var list = document.getElementById("recentConversations");
    list.textContent = "";
    var conversations = P.conversations.forProject(D.active().id);
    conversations.slice(0, 8).forEach(function (conversation) {
      var button = el("button", null, conversation.title); button.type = "button";
      button.title = "읽기 전용 기록: " + conversation.title;
      button.onclick = function () { archiveDialog(conversation); };
      list.appendChild(button);
    });
    if (!conversations.length) list.appendChild(el("span", "small", "아직 대화 기록이 없습니다."));
    if (conversations.length > 8) {
      var all = el("button", null, "전체 대화 기록 보기"); all.type = "button";
      all.onclick = function () {
        openDialog("모든 대화 기록", function (container) {
          conversations.forEach(function (conversation) {
            var button = el("button", "btn", conversation.title); button.type = "button";
            button.onclick = function () { dlg.close(); archiveDialog(conversation); };
            container.appendChild(el("p")).appendChild(button);
          });
        });
      };
      list.appendChild(all);
    }
    var current = P.conversations.active();
    var started = !!(current && (startedConversations.has(current.id) || current.activities.some(function (entry) {
      return entry.direction === "outgoing" && entry.activity.type === "message";
    })));
    if (started) startedConversations.add(current.id);
    document.getElementById("welcome").hidden = started;
  }
  root.addEventListener("panellab:conversations", renderConversations);
  function newConversation() {
    P.conversations.create(D.active().id);
    document.getElementById("sendStatus").textContent = "새 대화를 시작합니다. 이전 대화는 읽기 전용으로 보존됩니다.";
    setView("chat");
    setResults(false);
    P.connect();
  }
  document.getElementById("newConversation").onclick = newConversation;
  var currentProjectId = D.active().id;
  D.onChange(function () {
    if (D.active().id !== currentProjectId) {
      currentProjectId = D.active().id;
      newConversation();
    }
    renderConversations();
  });

  var TASKS = {
    analyze: ["PLC 도면 분석", "제공된 도면의 확인 가능한 정보, I/O 목록, 디바이스 주소, 글로벌 라벨, 도면 근거 및 확인 필요 사항을 구분해 주세요. 첨부하지 않은 이미지를 분석한 것처럼 응답하지 마세요."],
    draw: ["PLC 작화 요청", "다음 동작 조건에 대한 래더 작화를 요청합니다."],
    check: ["PLC 오류 검사", "다음 PLC 코드를 검토해 주세요. 이중 코일, 중복 주소, 자기유지, 미선언 변수, 접점·코일 사용 오류를 확인하고 위치·원인·수정 방법을 설명해 주세요."],
    fix: ["PLC 코드 수정", "다음 PLC 코드의 수정안을 제안해 주세요. 수정 전 원문과 수정 후 코드, 변경 이유를 구분해 주세요. 사용자 승인 전에는 적용하지 않습니다."],
    code: ["PLC 코드 생성", "다음 요구사항에 맞는 Mitsubishi PLC 코드와 설명을 요청합니다."],
    io: ["입출력 정보 정리", "제공된 원문에서 실제로 확인된 입출력 정보만 표로 정리하고, 미확인 주소와 추가 확인 사항을 구분해 주세요."],
    explain: ["추가 설명 요청", "제공된 원문의 의미와 근거를 추가 설명해 주세요. 확인할 수 없는 내용은 추측하지 말고 질문해 주세요."],
    verify: ["PLC 검증 요청", "제공된 코드와 근거를 검토하고 검증 항목, 확인 결과, 미확인 항목, 오류 및 경고를 구분해 주세요. AI 검토와 실제 GX Works 컴파일·장비 시험은 구분하고 수행하지 않은 시험을 완료로 표시하지 마세요."],
    report: ["PLC 보고서 요청", "현재 대화와 제공된 실제 근거만으로 도면 분석, 작화, 코드, 오류, 수정 내역, 검증 결과 및 최종 요약을 보고서로 정리해 주세요. 제공되지 않은 결과는 미확인으로 표시하고 추가 자료를 요청해 주세요."]
  };
  function requestDialog(task, sourceText) {
    setView("chat");
    var definition = TASKS[task];
    var context = P.conversations.active(), projectId = D.active().id;
    openDialog(definition[0], function (container) {
      container.appendChild(note("기존 통합운영 에이전트에 전송할 요청입니다. 새 AI나 로컬 검사기를 사용하지 않습니다."));
      container.appendChild(note("전송 대상: 현재 프로젝트 ‘" + D.active().name + "’의 대화입니다." +
        (sourceText ? " 이전 응답의 텍스트만 새 요청에 포함됩니다. 이전 이미지는 자동 재첨부되지 않습니다." : "")));
      var form = el("form", "form");
      var label = el("label", "fld"); label.appendChild(el("span", null, task === "check" || task === "fix" ? "검토할 코드와 요구사항" : "동작 조건과 요구사항"));
      var text = el("textarea"); text.required = true; text.maxLength = 50000;
      text.placeholder = "CPU 모델, 입출력 조건, 인터록 조건 등 확인된 정보만 입력하세요.";
      if (sourceText) text.value = "아래는 이전 에이전트의 원문입니다. 내용과 불확실한 항목을 재확인하여 후속 작업을 요청합니다.\n\n" + sourceText;
      label.appendChild(text); form.appendChild(label);
      var submit = el("button", "btn primary", "기존 에이전트에 전송"); submit.type = "submit";
      submit.disabled = !P.connected;
      var update = function () { submit.disabled = !P.connected; };
      root.addEventListener("panellab:connection", update);
      dlg.addEventListener("close", function () { root.removeEventListener("panellab:connection", update); }, { once: true });
      form.appendChild(note("연결 완료 후 전송할 수 있습니다. 파일 업로드는 아직 지원 확인 전입니다."));
      if (task === "analyze") {
        var image = el("button", "btn", "PNG·JPEG 이미지와 설명 준비"); image.type = "button";
        image.onclick = function () { dlg.close(); P.attachments.open(); }; form.appendChild(image);
        form.appendChild(note("PDF 입력은 기존 에이전트와 채널의 실제 지원 검증 전까지 비활성 상태입니다."));
      }
      form.appendChild(submit); container.appendChild(form);
      form.onsubmit = function (event) {
        event.preventDefault();
        if (!text.value.trim()) { text.setCustomValidity("요구사항이나 코드를 입력해 주세요."); text.reportValidity(); return; }
        if (P.conversations.active() !== context || D.active().id !== projectId) {
          text.setCustomValidity("대화 또는 프로젝트가 변경되었습니다. 요청 창을 다시 열어 주세요."); text.reportValidity(); return;
        }
        var project = D.active();
        var request = [
          definition[1], "프로젝트: " + project.name,
          "PLC 제조사: " + (project.vendor || "Mitsubishi 대상 · 구체 모델 미확인"),
          "소프트웨어: " + project.software, "CPU: " + (project.cpu || "미정"),
          "확인되지 않은 명령어와 호환성을 단정하지 말고, 정보가 부족하면 질문해 주세요.",
          "검증되지 않은 내용은 구분하고, PLC 적용 전 별도 검증이 필요함을 명시해 주세요.", "", text.value
        ].join("\n");
        if (!P.sendRequest(request)) { notify("에이전트 연결 후 다시 전송해 주세요."); return; }
        if (D.taskLabels[task]) D.recordTask(task, P.conversations.active());
        dlg.close(); setView("chat");
      };
      text.addEventListener("input", function () { text.setCustomValidity(""); });
    });
  }
  document.querySelectorAll("[data-task]").forEach(function (button) {
    button.onclick = function () { requestDialog(button.dataset.task); };
  });

  setView("chat");
  render();
  renderConversations();
  P.attachments.init();
  P.workspace.init({
    chat: function () { setView("chat"); }, home: dashboard, request: requestDialog,
    project: projectDialog, history: historyDialog, settings: settingsDialog,
    results: function (task) { document.getElementById("resultTaskFilter").value = task; setTab("all"); setView("results"); }
  });
  dashboard();
  P.connect();
})(window);
