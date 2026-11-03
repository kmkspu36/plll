"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

function setup(initial = {}) {
  const storage = new Map(Object.entries(initial)), events = [];
  let fail = false, writes = 0;
  const root = { PanelLab: {}, crypto: { randomUUID }, dispatchEvent: (event) => events.push(event) };
  const sandbox = {
    window: root, setTimeout: (callback) => callback(),
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => { if (fail) throw new Error("quota"); storage.set(key, value); writes++; }
    }
  };
  for (const file of ["projects.js", "conversations.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), sandbox);
  }
  return { P: root.PanelLab, storage, events, writes: () => writes, fail: () => { fail = true; }, sandbox };
}
test("delayed response stays bound to original project and preserves original", () => {
  const f = setup(), d = f.P.data, c = f.P.conversations.create(d.active().id);
  const old = d.active().id;
  d.addProject({ name: "Other", software: "GX Works2" });
  const activity = { id: "message", text: "original response", type: "message", from: { role: "bot" } };
  const result = d.addResult("message", 0, { type: "plc_code", title: "PLC 코드", data: { code: "LD X0\nOUT Y0" } }, c, activity);
  assert.equal(result.projectId, old);
  assert.equal(d.resultsFor(d.active().id).length, 0);
  assert.equal(result.original.text, activity.text);
  assert.equal(d.addResult("message", 0, { type: "plc_code", data: {} }, c), null);
});
test("correction does not change working copy until approval", () => {
  const f = setup(), d = f.P.data, c = f.P.conversations.create(d.active().id);
  const result = d.addResult("fix", 0, { type: "correction", title: "수정", data: { before: "before", after: "after" } }, c, { text: "reason" });
  assert.equal(d.active().workingCopy, undefined);
  assert.equal(result.approval, "proposed");
  d.approve(result.key);
  assert.equal(d.active().workingCopy.code, "after");
  assert.equal(d.active().workingCopy.before, "before");
  assert.equal(d.active().workingCopy.original.text, "reason");
  assert.equal(result.approval, "approved");
});
test("storage failure reports error without dropping results", () => {
  const f = setup(), d = f.P.data, project = d.active().id;
  f.fail();
  for (let i = 0; i < 55; i++) d.addResult(String(i), 0, { type: "plc_code", data: { code: "test" } });
  assert.equal(d.resultsFor(project).length, 55);
  assert.ok(f.events.some((event) => event.type === "panellab:error"));
});
test("malformed persisted data is not overwritten", () => {
  const f = setup({ "panellab.projects.v1": "{broken", "panellab.conversations.v1": "{}" });
  assert.equal(f.writes(), 0);
  f.P.conversations.create(f.P.data.active().id);
  assert.equal(f.storage.get("panellab.conversations.v1"), "{}");
});
test("raw message archive is copied, deduplicated and survives reload", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  const activity = { type: "message", id: "bot-1", text: "actual text", attachments: [{ contentType: "application/json", content: { data: 1 } }] };
  f.P.conversations.record(c, activity, "incoming");
  activity.text = "mutated";
  assert.equal(c.activities[0].activity.text, "actual text");
  f.P.conversations.record(c, activity, "incoming");
  assert.equal(c.activities.length, 1);
  const restored = setup(Object.fromEntries(f.storage));
  assert.equal(restored.P.conversations.forProject(c.projectId)[0].activities[0].activity.text, "mutated");
  assert.equal(restored.P.conversations.active(), null);
});
test("store observers preserve normal Web Chat flow and bind context", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  let middleware;
  f.sandbox.WebChat = { createStore: (_, factory) => { middleware = factory()((action) => action); return {}; } };
  f.sandbox.console = console;
  f.P.analyzer = { analyze: () => [{ type: "plc_code", data: { code: "LD X0\nOUT Y0" } }] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/store.js"), "utf8"), f.sandbox);
  f.P.createStore(c);
  const action = { type: "DIRECT_LINE/INCOMING_ACTIVITY", payload: { activity: { type: "message", id: "a", from: { role: "bot" }, text: "response" } } };
  assert.equal(middleware(action), action);
  assert.equal(c.activities.length, 1);
  assert.equal(f.P.data.resultsFor(c.projectId).length, 1);
  f.P.analyzer.analyze = () => { throw new Error("parser failure"); };
  assert.equal(middleware(action), action);
  assert.ok(f.events.some((event) => event.type === "panellab:error"));
});
test("send states follow Web Chat 4.18 payloads and ignore greeting events", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  let dispatch;
  f.sandbox.WebChat = { createStore: (_, factory) => { dispatch = factory()((action) => action); } };
  f.P.analyzer = { analyze: () => [] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/store.js"), "utf8"), f.sandbox);
  f.P.createStore(c);
  const status = () => f.events.filter((event) => event.type === "panellab:send").at(-1)?.detail;
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_PENDING", meta: { clientActivityID: "event" }, payload: { activity: { type: "event" } } });
  assert.equal(status(), undefined);
  const message = { type: "message", text: "request" };
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_PENDING", meta: { clientActivityID: "1" }, payload: { activity: message } });
  assert.equal(status().state, "sending");
  assert.equal(status().conversationId, c.id);
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_FULFILLED", meta: { clientActivityID: "1" }, payload: { activity: message } });
  assert.equal(status().state, "waiting");
  dispatch({ type: "DIRECT_LINE/INCOMING_ACTIVITY", payload: { activity: { type: "typing", from: { role: "bot" } } } });
  assert.match(status().message, /작성/);
  dispatch({ type: "DIRECT_LINE/INCOMING_ACTIVITY", payload: { activity: { type: "message", text: "response", from: { role: "bot" } } } });
  assert.equal(status().state, "received");
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_PENDING", meta: { clientActivityID: "2" }, payload: { activity: message } });
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_REJECTED", meta: { clientActivityID: "2" }, payload: new Error("test") });
  assert.equal(status().state, "failed");
});
test("fast reply before send acknowledgement is not changed back to waiting", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  let dispatch;
  f.sandbox.WebChat = { createStore: (_, factory) => { dispatch = factory()((action) => action); } };
  f.P.analyzer = { analyze: () => [] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/store.js"), "utf8"), f.sandbox);
  f.P.createStore(c);
  const meta = { clientActivityID: "1" }, payload = { activity: { type: "message", text: "request" } };
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_PENDING", meta, payload });
  dispatch({ type: "DIRECT_LINE/INCOMING_ACTIVITY", payload: { activity: { type: "message", text: "response", from: { role: "bot" } } } });
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY_FULFILLED", meta, payload });
  assert.equal(f.events.filter((event) => event.type === "panellab:send").at(-1).detail.state, "received");
});
test("native send-box attachments cannot bypass unverified upload gate", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  let dispatch, forwarded = 0;
  f.sandbox.WebChat = { createStore: (_, factory) => { dispatch = factory()((action) => { forwarded++; return action; }); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/store.js"), "utf8"), f.sandbox);
  f.P.createStore(c);
  const action = { type: "WEB_CHAT/SEND_MESSAGE", payload: { text: "analyze", attachments: [{ blob: { size: 10, type: "image/png" } }] } };
  dispatch(action);
  assert.equal(forwarded, 0);
  f.P.connected = true;
  f.P.uploadCapabilities = { verified: true, maxFiles: 1, maxBytes: 100 };
  dispatch(action);
  assert.equal(forwarded, 1);
});
test("attachment-only post is archived as a user message without requiring text", () => {
  const f = setup(), c = f.P.conversations.create(f.P.data.active().id);
  let dispatch;
  f.sandbox.WebChat = { createStore: (_, factory) => { dispatch = factory()((action) => action); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/store.js"), "utf8"), f.sandbox);
  f.P.createStore(c);
  const activity = { type: "message", attachments: [{ contentType: "image/png", contentUrl: "blob:local-test" }] };
  const action = { type: "DIRECT_LINE/POST_ACTIVITY", payload: { activity } };
  assert.equal(dispatch(action), action);
  assert.equal(c.activities.length, 1);
  assert.equal(c.activities[0].direction, "outgoing");
  assert.equal(c.activities[0].activity.attachments[0].contentType, "image/png");
  assert.match(f.P.data.historyFor(c.projectId)[0].text, /첨부/);
  dispatch({ type: "DIRECT_LINE/POST_ACTIVITY", payload: { activity: { type: "event", name: "startConversation" } } });
  assert.equal(c.activities.length, 1);
});
test("project metadata is additive and status is explicitly user supplied", () => {
  const f = setup(), d = f.P.data, original = d.active();
  assert.equal(original.status, undefined);
  const project = d.addProject({ name: "Motor", description: "Confirmed interlock scope", status: "active", software: "GX Works2" });
  assert.equal(project.cpu, "");
  assert.equal(project.status, "active");
  assert.equal(project.description, "Confirmed interlock scope");
  d.updateProject(project.id, { status: "toString", description: "Updated" });
  assert.equal(project.status, "active");
  assert.equal(project.description, "Updated");
  const restored = setup(Object.fromEntries(f.storage)).P.data;
  assert.equal(restored.projects().find((p) => p.id === original.id).name, original.name);
  assert.equal(restored.projects().find((p) => p.id === project.id).description, "Updated");
});
test("task requests and user classifications never manufacture completion or other project results", () => {
  const f = setup(), d = f.P.data, c = f.P.conversations.create(d.active().id);
  d.recordTask("verify", c);
  assert.equal(d.active().requests[0].task, "verify");
  assert.equal(d.active().requests[0].conversationId, c.id);
  assert.equal(d.active().requests[0].state, undefined);
  assert.equal(d.active().status, undefined);
  assert.equal(d.resultsFor(c.projectId).length, 0);
  const result = d.addResult("real-raw", 0, { type: "raw_response", data: { text: "Unconfirmed observations" } }, c, { text: "Unconfirmed observations" });
  d.assignTask(result.key, "verify");
  assert.equal(result.task, "verify");
  assert.equal(result.classifiedBy, "user");
  assert.equal(result.type, "raw_response");
  assert.equal(result.approval, "proposed");
  assert.throws(() => d.recordTask("toString", c), /작업 종류/);
  assert.throws(() => d.assignTask(result.key, "unsupported"), /작업 종류/);
  d.addProject({ name: "Separate" });
  assert.equal(d.resultsFor(d.active().id).length, 0);
  const restored = setup(Object.fromEntries(f.storage)).P.data;
  assert.equal(restored.resultsFor(c.projectId)[0].task, "verify");
  assert.equal(restored.projects().find((p) => p.id === c.projectId).requests.length, 1);
});
test("work history derives from preserved conversations after reload", () => {
  const f = setup(), d = f.P.data, c = f.P.conversations.create(d.active().id);
  f.P.conversations.record(c, { type: "message", text: "Request preserved across sessions", id: "request" }, "outgoing");
  d.addHistory({ kind: "user", text: "Request preserved across sessions" }, c);
  assert.equal(d.historyFor(c.projectId).length, 1);
  const restored = setup(Object.fromEntries(f.storage));
  assert.equal(restored.P.data.historyFor(c.projectId)[0].text, "Request preserved across sessions");
  assert.equal(restored.P.data.historyFor(c.projectId).length, 1);
});
