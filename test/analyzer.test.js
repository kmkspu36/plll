const assert = require("assert");
const { analyze } = require("../js/analyzer.js");
const { diffLines } = require("../js/diff.js");

const msg = (text, extra) => Object.assign({ type: "message", id: "1", text, from: { role: "bot" } }, extra);
const types = (a) => analyze(a).map((r) => r.type);
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("plain text -> text", () => assert.deepStrictEqual(types(msg("안녕하세요. 무엇을 도와드릴까요?")), ["text"]));
t("prose with := is not code", () => assert.deepStrictEqual(types(msg("a := b 라고 쓰면 됩니다")), ["text"]));
t("labeled ST fence -> plc_code", () => assert.deepStrictEqual(types(msg("```st\nIF X0 THEN\n Y0 := TRUE;\nEND_IF;\n```")), ["plc_code"]));
t("unlabeled IL fence -> plc_code", () => assert.deepStrictEqual(types(msg("```\nLD X0\nOR Y0\nANI X1\nOUT Y0\n```")), ["plc_code"]));
t("unlabeled non-PLC fence ignored", () => assert.deepStrictEqual(types(msg("```\nnpm install\n```")), ["text"]));
t("ladder fence", () => assert.deepStrictEqual(types(msg("```ladder\nLD X0\nOUT Y0\n```")), ["ladder"]));
t("invalid JSON not shown as result", () => assert.deepStrictEqual(types(msg("{ broken json")), ["text"]));
t("valid JSON -> structured_json", () => assert.deepStrictEqual(types(msg('{"a":1}')), ["structured_json"]));
t("typed JSON -> error_report", () => assert.deepStrictEqual(types(msg(JSON.stringify({ type: "error_report", items: [{ type: "문법", location: "3행", cause: "x", fix: "y" }] }))), ["error_report"]));
t("error report text", () => {
  const r = analyze(msg("1. 오류 유형: 문법 오류\n위치: 3번째 줄\n원인: 세미콜론 누락\n수정 방법: ;를 추가"));
  assert.strictEqual(r[0].type, "error_report"); assert.strictEqual(r[0].data.items[0].location, "3번째 줄");
});
t("single field not error report", () => assert.deepStrictEqual(types(msg("원인: 모르겠습니다")), ["text"]));
t("correction before/after", () => {
  const r = analyze(msg("수정 전\n```st\nIF X0 THEN\n Y0 := 1;\nEND_IF;\n```\n수정 후\n```st\nIF X0 THEN\n Y0 := TRUE;\nEND_IF;\n```"));
  assert.deepStrictEqual(r.map((x) => x.type), ["correction"]);
});
t("image/doc/card attachments", () => {
  const r = analyze(msg("", { attachments: [
    { contentType: "image/png", contentUrl: "https://x/y.png", name: "a.png" },
    { contentType: "application/pdf", contentUrl: "https://x/y.pdf", name: "a.pdf" },
    { contentType: "application/vnd.microsoft.card.adaptive", content: { type: "AdaptiveCard" } },
    { contentType: "image/png", contentUrl: "javascript:alert(1)" }
  ] }));
  assert.deepStrictEqual(r.map((x) => x.type), ["image", "document", "adaptive_card"]);
});
t("mixed response", () => assert.deepStrictEqual(types(msg("```st\nIF X0 THEN\n Y0 := TRUE;\nEND_IF;\n```", { attachments: [{ contentType: "image/png", contentUrl: "https://x/a.png" }] })), ["plc_code", "image"]));
t("non-message ignored", () => assert.deepStrictEqual(types({ type: "typing" }), ["text"]));
t("diff", () => {
  const d = diffLines("a\nb\nc", "a\nB\nc");
  assert.deepStrictEqual(d.map((x) => x.t), ["same", "del", "add", "same"]);
});
console.log(n + " tests passed");
