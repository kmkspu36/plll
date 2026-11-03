"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

function setup(initial = {}) {
  const storage = new Map(Object.entries(initial)), events = [];
  let blocked = false;
  const localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error("quota"); storage.set(key, value); },
    removeItem: key => storage.delete(key) };
  const root = { PanelLab: {}, localStorage, crypto: { randomUUID }, dispatchEvent: event => events.push(event), setTimeout: fn => fn() };
  const sandbox = { window: root, localStorage, setTimeout: fn => fn(),
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } };
  ["projects.js", "conversations.js", "engineering.js"].forEach(file => vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), sandbox));
  return { P: root.PanelLab, storage, events, fail: () => { blocked = true; } };
}
test("engineering records are project isolated, corrected with history and persisted", () => {
  const f = setup(), d = f.P.data, e = f.P.engineering, id = d.active().id;
  const record = e.addRecord(id, "io", { kind: "input", address: "X0", name: "Start" });
  e.addRecord(id, "io", { kind: "input", address: "X1", name: "Changed" }, record.id);
  assert.equal(e.list(id, "io")[0].history[0].values.address, "X0");
  assert.equal(e.list(id, "io")[0].values.address, "X1");
  const other = d.addProject({ name: "Other" }).id;
  assert.equal(e.list(other).length, 0);
  assert.throws(() => e.addRecord(other, "io", { kind: "input", address: "X2" }, record.id), /찾지/);
  assert.equal(setup(Object.fromEntries(f.storage)).P.engineering.list(id).length, 1);
});
test("address and missing-label diagnostics are candidates, not fabricated PLC errors", () => {
  const f = setup(), e = f.P.engineering, d = f.P.data, id = d.active().id;
  e.addRecord(id, "io", { kind: "input", address: "x0" });
  e.addRecord(id, "io", { kind: "input", address: "X0" });
  e.addRecord(id, "labels", { name: "Start", address: "X0", dataType: "BOOL" });
  const r = d.addResult("real", 0, { type: "raw_response", title: "Actual", data: { text: "Read original" } });
  e.addRecord(id, "evidence", { location: "Page 1 left", variable: "Start,Unknown", sourceKey: r.key });
  const warnings = e.diagnostics(id);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(text => text.includes("중복 후보")));
  assert.ok(warnings.some(text => text.includes("Unknown")));
  assert.equal(d.resultsFor(id).length, 1);
});
test("completion requires a real result assigned to the matching stage", () => {
  const f = setup(), e = f.P.engineering, d = f.P.data, id = d.active().id;
  assert.throws(() => e.setStage(id, "draw", "complete", "", "Checked"), /실제 결과/);
  assert.throws(() => e.setStage(id, "draw", "running", "", "Running"), /요청 기록/);
  const r = d.addResult("real", 0, { type: "raw_response", data: { text: "Unconfirmed drawing" } });
  assert.throws(() => e.setStage(id, "draw", "complete", r.key, "Checked"), /실제 결과/);
  d.assignTask(r.key, "draw");
  e.setStage(id, "draw", "complete", r.key, "User reviewed original");
  assert.equal(e.progress(id).complete, 1);
  d.clearResults(id);
  assert.equal(e.progress(id).complete, 0);
  assert.equal(e.snapshot(id).stages.length, 1);
});
test("later requests invalidate prior user completion without destroying history", () => {
  const f = setup(), e = f.P.engineering, d = f.P.data, id = d.active().id;
  const r = d.addResult("real", 0, { type: "plc_code", data: { code: "LD X0\nOUT Y0" } });
  d.assignTask(r.key, "code"); e.setStage(id, "code", "complete", r.key, "Checked");
  const c = f.P.conversations.create(id); d.recordTask("code", c);
  d.active().requests[0].requestedAt = "2099-01-01T00:00:00.000Z";
  assert.equal(e.progress(id).complete, 0);
});
test("a request with the same timestamp still invalidates prior stage confirmation", () => {
  const f = setup(), e = f.P.engineering, d = f.P.data, id = d.active().id;
  const r = d.addResult("real", 0, { type: "plc_code", data: { code: "LD X0\nOUT Y0" } });
  d.assignTask(r.key, "code");
  const stage = e.setStage(id, "code", "complete", r.key, "Checked");
  const c = f.P.conversations.create(id); d.recordTask("code", c);
  d.active().requests[0].requestedAt = stage.createdAt;
  assert.equal(e.progress(id).complete, 0);
});
test("version restore appends exact code and preserves previous versions", () => {
  const f = setup(), e = f.P.engineering, id = f.P.data.active().id;
  const code = "  LD X0\n  OUT Y0\n";
  const first = e.addVersion(id, code, "First");
  e.addVersion(id, "LD X1\nOUT Y1", "Second");
  const restored = e.restoreVersion(id, first.id);
  assert.equal(restored.code, code);
  assert.equal(restored.restoredFrom, first.id);
  assert.equal(e.versions(id).length, 3);
  const other = f.P.data.addProject({ name: "Other" }).id;
  assert.throws(() => e.restoreVersion(other, first.id), /찾지/);
});
test("quota failure does not appear saved and corrupt data is never overwritten", () => {
  const f = setup(), id = f.P.data.active().id; f.fail();
  assert.throws(() => f.P.engineering.addVersion(id, "LD X0", "First"), /저장에 실패/);
  assert.equal(f.P.engineering.versions(id).length, 0);
  const bad = setup({ "panellab.engineering.v1": "{bad" });
  assert.throws(() => bad.P.engineering.addVersion(bad.P.data.active().id, "LD X0", "First"), /복구/);
  assert.equal(bad.storage.get("panellab.engineering.v1"), "{bad");
});
test("rejection preserves original proposal and approval failure does not alter working copy", () => {
  const f = setup(), d = f.P.data;
  const r = d.addResult("real", 0, { type: "correction", data: { before: "a", after: "b" } });
  d.reject(r.key, "Needs verification");
  assert.equal(d.resultsFor(d.active().id)[0].data.before, "a");
  assert.equal(d.resultsFor(d.active().id)[0].approval, "rejected");
  f.fail();
  assert.throws(() => d.approve(r.key), /저장하지 못/);
  assert.equal(d.active().workingCopy, undefined);
  assert.equal(d.resultsFor(d.active().id)[0].approval, "rejected");
});
