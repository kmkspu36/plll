/* Response analyzer: pure functions, no DOM. Chat content is never modified. */
(function (root) {
  "use strict";

  var PLC_LANGS = ["plc", "st", "iecst", "structuredtext", "il", "instructionlist", "gxworks", "gxworks2", "gxworks3", "melsec", "fbd", "sfc"];
  var LADDER_LANGS = ["ladder", "ld", "ladderdiagram"];
  var MNEMONIC = /^\s*(LDI|LDP|LDF|LD|ANDP|ANDF|ANI|AND|ORI|ORP|ORF|OR|OUT|SET|RST|MOV|DMOV|TMR|CNT|ANB|ORB|MPS|MRD|MPP|END|PLS|PLF|INC|DEC|CMP|ADD|SUB|MUL|DIV)\b/i;
  var ST_HINT = /\bEND_IF\b|\bEND_FOR\b|\bEND_WHILE\b|\bEND_CASE\b|\bEND_VAR\b|\bFUNCTION_BLOCK\b|\bPROGRAM\b[\s\S]*\bEND_PROGRAM\b|:=/;
  var ST_KEYWORD = /\b(IF|FOR|WHILE|CASE|VAR)\b/;

  var FIELD_KEYS = {
    "오류유형": "type", "유형": "type",
    "위치": "location", "오류위치": "location",
    "원인": "cause",
    "수정방법": "fix", "해결방법": "fix",
    "검토상태": "status", "상태": "status"
  };
  var FIELD_RE = /^[\s>*\-\d.#)\u2022]*\**\s*([가-힣 ]{2,6}?)\s*\**\s*[:：]\s*\**\s*(.+?)\s*$/;

  function isPlcLike(code, lang) {
    var l = (lang || "").toLowerCase();
    if (PLC_LANGS.indexOf(l) >= 0) return true;
    if (l) return false;
    var lines = code.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) return false;
    var hits = lines.filter(function (s) { return MNEMONIC.test(s); }).length;
    if (hits >= 2 && hits / lines.length >= 0.6) return true;
    return ST_HINT.test(code) && ST_KEYWORD.test(code);
  }

  function tryJson(text) {
    var t = (text || "").trim();
    if (!t || (t[0] !== "{" && t[0] !== "[")) return { ok: false };
    try { return { ok: true, value: JSON.parse(t) }; } catch (e) { return { ok: false }; }
  }

  function str(v) { return typeof v === "string" ? v : ""; }

  function fromStructured(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      var kind = str(value.panellabType || value.type).toLowerCase();
      if (kind === "plc_code" && str(value.code)) {
        return { type: "plc_code", title: "PLC 코드", data: { language: str(value.language) || "plc", code: value.code } };
      }
      if (kind === "ladder" && str(value.source)) {
        return { type: "ladder", title: "작화", data: { source: value.source, language: "ladder" } };
      }
      if (kind === "correction" && str(value.before) && str(value.after)) {
        return { type: "correction", title: "코드 수정", data: { before: value.before, after: value.after } };
      }
      if (kind === "error_report" && Array.isArray(value.items || value.errors)) {
        var items = (value.items || value.errors).filter(function (i) { return i && typeof i === "object"; }).map(function (i) {
          return { type: str(i.type), location: str(i.location), cause: str(i.cause), fix: str(i.fix), status: str(i.status) };
        });
        if (items.length) return { type: "error_report", title: "오류 검사 결과", data: { items: items } };
      }
    }
    return { type: "structured_json", title: "JSON", data: { value: value } };
  }

  function parseErrorItems(text) {
    var items = [];
    var cur = null;
    text.split("\n").forEach(function (line) {
      var m = FIELD_RE.exec(line);
      if (!m) return;
      var key = FIELD_KEYS[m[1].replace(/\s+/g, "")];
      if (!key) return;
      if (!cur || cur[key]) { cur = {}; items.push(cur); }
      cur[key] = m[2].replace(/\*+/g, "").trim();
    });
    return items.filter(function (i) {
      var n = Object.keys(i).length;
      return n >= 2 && (i.type || i.location || i.cause);
    }).map(function (i) {
      return { type: i.type || "", location: i.location || "", cause: i.cause || "", fix: i.fix || "", status: i.status || "" };
    });
  }

  function extractBlocks(text) {
    var re = /```([^\n`]*)\n([\s\S]*?)```/g, blocks = [], m, last = 0, prose = [];
    while ((m = re.exec(text))) {
      var before = text.slice(last, m.index);
      prose.push(before);
      blocks.push({ lang: m[1].trim(), code: m[2].replace(/\n$/, ""), before: before });
      last = re.lastIndex;
    }
    prose.push(text.slice(last));
    return { blocks: blocks, prose: prose.join("\n") };
  }

  function label(before) {
    var tail = before.slice(-100);
    var b = /수정\s*전|\bbefore\b/i.exec(tail), a = /수정\s*후|\bafter\b/i.exec(tail);
    if (a && (!b || a.index > b.index)) return "after";
    if (b) return "before";
    return null;
  }

  function analyzeText(text) {
    var out = [];
    if (!text || !text.trim()) return out;
    var whole = tryJson(text);
    if (whole.ok) { out.push(fromStructured(whole.value)); return out; }

    var ex = extractBlocks(text);
    var plc = [], before = null, after = null;
    ex.blocks.forEach(function (b) {
      var l = b.lang.toLowerCase();
      if (l === "json") {
        var j = tryJson(b.code);
        if (j.ok) out.push(fromStructured(j.value));
        return;
      }
      if (LADDER_LANGS.indexOf(l) >= 0) {
        out.push({ type: "ladder", title: "작화", data: { source: b.code, language: l } });
        return;
      }
      if (!isPlcLike(b.code, b.lang)) return;
      var lab = label(b.before);
      if (lab === "before" && !before) before = b;
      else if (lab === "after" && !after) after = b;
      else plc.push(b);
    });
    if (before && after) {
      out.push({ type: "correction", title: "코드 수정", data: { before: before.code, after: after.code } });
    } else {
      if (before) plc.push(before);
      if (after) plc.push(after);
    }
    plc.forEach(function (b) {
      out.push({ type: "plc_code", title: "PLC 코드", data: { language: b.lang || "plc", code: b.code } });
    });
    var errs = parseErrorItems(ex.prose);
    if (errs.length) out.push({ type: "error_report", title: "오류 검사 결과", data: { items: errs } });
    return out;
  }

  function safeUrl(u, allowData) {
    if (typeof u !== "string") return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (allowData && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(u)) return u;
    return "";
  }

  function analyzeAttachment(att) {
    if (!att || typeof att !== "object") return null;
    var ct = str(att.contentType).toLowerCase();
    var name = str(att.name) || "첨부파일";
    if (ct.indexOf("image/") === 0) {
      var url = safeUrl(att.contentUrl, true);
      return url ? { type: "image", title: name, data: { url: url, name: name, contentType: ct } } : null;
    }
    if (ct === "application/vnd.microsoft.card.adaptive") {
      var card = att.content;
      if (typeof card === "string") { var p = tryJson(card); card = p.ok ? p.value : null; }
      return card && typeof card === "object" ? { type: "adaptive_card", title: "Adaptive Card", data: { card: card } } : null;
    }
    if (ct === "application/json") {
      var v = att.content;
      if (typeof v === "string") { var q = tryJson(v); if (!q.ok) return null; v = q.value; }
      return v && typeof v === "object" ? fromStructured(v) : null;
    }
    if (ct.indexOf("application/vnd.microsoft.card.") === 0) return null;
    var durl = safeUrl(att.contentUrl, false);
    return durl ? { type: "document", title: name, data: { url: durl, name: name, contentType: ct } } : null;
  }

  function analyze(activity) {
    var results = [];
    if (!activity || activity.type !== "message") return [{ type: "text", title: "", data: {} }];
    analyzeText(str(activity.text)).forEach(function (r) { results.push(r); });
    (Array.isArray(activity.attachments) ? activity.attachments : []).forEach(function (a) {
      var r = analyzeAttachment(a);
      if (r) results.push(r);
    });
    return results.length ? results : [{ type: "text", title: "", data: {} }];
  }

  var api = { analyze: analyze, analyzeText: analyzeText, isPlcLike: isPlcLike };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PanelLab = root.PanelLab || {}; root.PanelLab.analyzer = api; }
})(typeof window !== "undefined" ? window : globalThis);
