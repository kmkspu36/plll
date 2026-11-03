"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
function setup() {
  const store = new Map();
  let failKey = null;
  const localStorage = { getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { if (key === failKey) { failKey = null; throw new Error("quota"); } store.set(key, value); },
    removeItem: key => store.delete(key) };
  const root = { PanelLab: {}, localStorage, crypto: { randomUUID }, dispatchEvent() {}, setTimeout: fn => fn(), atob, btoa };
  const sandbox = { window: root, localStorage, Blob, Uint8Array, setTimeout: fn => fn(), CustomEvent: class {} };
  ["projects.js", "conversations.js", "engineering.js", "reports.js"].forEach(file => vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), sandbox));
  root.PanelLab.storage = { filesFor: async () => [], addFiles: async () => {}, rollbackFiles: async () => {} };
  return { P: root.PanelLab, store, fail: key => { failKey = key; } };
}
async function fixture(f) {
  const d = f.P.data, id = d.active().id, c = f.P.conversations.create(id);
  f.P.conversations.record(c, { id: "real", type: "message", text: "Original text" }, "incoming");
  const result = d.addResult("real", 0, { type: "plc_code", title: "Code", data: { code: "LD X0\nOUT Y0" } }, c, { text: "Original text" });
  d.assignTask(result.key, "code");
  f.P.engineering.addVersion(id, result.data.code, "First", result.key);
  return f.P.reports.exportProject(id);
}
test("report cites actual originals, unresolved stages and never invents success", async () => {
  const f = setup(), pack = await fixture(f), report = f.P.reports.markdown(pack.project.id);
  assert.match(report, /Original text/); assert.ok(report.includes(pack.results[0].key));
  assert.match(report, /미확인/); assert.doesNotMatch(report, /100%|검증 성공/);
});
test("backup restoration creates a separate project and remaps source ownership", async () => {
  const f = setup(), pack = await fixture(f), prepared = f.P.reports.prepareRestore(pack);
  assert.notEqual(prepared.pack.project.id, pack.project.id);
  assert.equal(prepared.pack.engineering.versions[0].sourceKey, prepared.pack.results[0].key);
  assert.equal(prepared.pack.results[0].conversationId, prepared.pack.conversations[0].id);
  const id = await f.P.reports.restore(pack);
  const projects = JSON.parse(f.store.get("panellab.projects.v1"));
  assert.equal(projects.length, 2); assert.equal(projects[1].id, id);
  assert.equal(projects[0].id, pack.project.id);
});
test("invalid formats, cross-project data and unsafe keys are rejected before writes", async () => {
  const f = setup(), pack = await fixture(f);
  pack.results[0].projectId = "foreign";
  assert.throws(() => f.P.reports.prepareRestore(pack), /소유 관계/);
  const unsafe = JSON.parse('{"format":"panellab-project","__proto__":{}}');
  assert.throws(() => f.P.reports.validate(unsafe), /안전하지/);
  assert.throws(() => f.P.reports.validate({ schema: 99 }), /지원하지/);
});
test("partial restore write failure rolls back every written key", async () => {
  const f = setup(), pack = await fixture(f);
  const before = new Map(f.store);
  f.fail("panellab.conversations.v1");
  await assert.rejects(() => f.P.reports.restore(pack), /기존 자료는 유지/);
  assert.deepEqual(f.store, before);
});
test("image bytes and invalid project requests are validated before restoration", async () => {
  const f = setup(), pack = await fixture(f);
  pack.files.push({ id: "image", projectId: pack.project.id, name: "fake.png", type: "image/png", base64: btoa("not an image") });
  assert.throws(() => f.P.reports.prepareRestore(pack), /실제 이미지/);
  pack.files = []; pack.project.requests = {};
  assert.throws(() => f.P.reports.validate(pack), /요청 이력/);
});
test("a concurrent storage update is not overwritten during image restoration", async () => {
  const f = setup(), pack = await fixture(f);
  pack.files.push({ id: "image", projectId: pack.project.id, name: "test.png", type: "image/png",
    base64: Buffer.from([137,80,78,71,13,10,26,10]).toString("base64") });
  let rolledBack = false;
  f.P.storage.addFiles = async () => { f.store.set("panellab.projects.v1", '["concurrent-edit-marker"]'); };
  f.P.storage.rollbackFiles = async () => { rolledBack = true; };
  await assert.rejects(() => f.P.reports.restore(pack), /기존 자료는 유지/);
  assert.equal(f.store.get("panellab.projects.v1"), '["concurrent-edit-marker"]');
  assert.equal(rolledBack, true);
});
