"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(fetchResponse) {
  const elements = new Map(), lines = [], requests = [], dispatched = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, disabled: false, textContent: "", dataset: {}, classList: { toggle() {} },
      addEventListener(name, callback) { this[name] = callback; }
    });
    return elements.get(id);
  }
  let contextId = 0;
  const root = {
    dispatchEvent() {},
    PanelLab: {
      data: { active: () => ({ id: "project" }) },
      conversations: {
        active: () => null,
        create: () => ({ id: String(++contextId), projectId: "project" })
      },
      createStore: () => ({ dispatch: (action) => dispatched.push(action) })
    },
    WebChat: {
      createStore() {},
      renderWebChat(options) { assert.equal(options.styleOptions.hideUploadButton, true); },
      createDirectLine() {
        let callback;
        const line = {
          ended: false, unsubscribed: false, greetings: 0,
          end() { this.ended = true; },
          postActivity() { this.greetings++; return { subscribe() {} }; },
          connectionStatus$: { subscribe(cb) { callback = cb; cb(1); return { unsubscribe() { line.unsubscribed = true; } }; } },
          emit(state) { callback(state); }
        };
        lines.push(line); return line;
      }
    }
  };
  const sandbox = {
    window: root, document: { getElementById: element, querySelector: element },
    AbortController, File, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return fetchResponse ? fetchResponse(url, options) : { ok: true, json: async () => ({ token: "test-token" }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/connection.js"), "utf8"), sandbox);
  return { P: root.PanelLab, root, element, lines, requests, dispatched };
}
test("connection only becomes ready on Online and greets once", async () => {
  const f = setup();
  await f.P.connect();
  assert.equal(f.P.connected, false);
  assert.equal(f.P.sendRequest("request"), false);
  assert.equal(f.element("connectionLabel").textContent, "연결 중");
  f.lines[0].emit(2);
  f.lines[0].emit(2);
  assert.equal(f.P.connected, true);
  assert.equal(f.element("app").dataset.connection, "ready");
  assert.equal(f.element("connectionScreen").hidden, true);
  assert.equal(f.lines[0].greetings, 1);
  assert.equal(f.P.sendRequest("request"), true);
  assert.equal(f.dispatched[0].payload.text, "request");
  assert.equal(f.requests[0].url, "/api/chatToken");
  assert.equal(f.requests[0].options.body, undefined);
  f.P.disconnect();
});
test("Azure deployment keeps the token API role-restricted on the supported runtime", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../staticwebapp.config.json"), "utf8"));
  assert.equal(config.platform.apiRuntime, "node:22");
  assert.deepEqual(config.routes.find(route => route.route === "/api/*").allowedRoles, ["engineer"]);
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/azure-static-web-apps.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /cp index\.html staticwebapp\.config\.json/);
  assert.match(workflow, /cp -R css js/);
  assert.doesNotMatch(workflow, /cp -R api .*panellab-deploy/);
});
test("terminal status permits a clean new connection", async () => {
  const f = setup();
  await f.P.connect(); f.lines[0].emit(3);
  assert.equal(f.element("app").dataset.connection, "error");
  assert.equal(f.element("connectionScreen").hidden, false);
  assert.equal(f.element("retryConnect").hidden, false);
  assert.equal(f.P.connected, false);
  await f.P.connect();
  assert.equal(f.lines[0].ended, true);
  assert.equal(f.lines[0].unsubscribed, true);
  f.lines[0].emit(2);
  assert.equal(f.P.connected, false);
  f.lines[1].emit(2);
  assert.equal(f.P.connected, true);
  f.P.disconnect();
});
test("missing Web Chat and token endpoint errors are explicit", async () => {
  const missing = setup(); missing.root.WebChat = null;
  await missing.P.connect();
  assert.match(missing.element("statusText").textContent, /구성 요소/);
  for (const status of [401, 403, 404, 429, 503, 502]) {
    const f = setup(async () => ({ ok: false, status }));
    await f.P.connect();
    assert.equal(f.lines.length, 0);
    assert.equal(f.P.connected, false);
    assert.equal(f.element("retryConnect").hidden, false);
  }
});
test("invalid token, JSON and network failures cannot show connected", async () => {
  for (const response of [
    async () => ({ ok: true, json: async () => ({ token: " " }) }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("test"); } }),
    async () => { throw new Error("offline"); }
  ]) {
    const f = setup(response); await f.P.connect();
    assert.equal(f.P.connected, false);
    assert.equal(f.element("status").hidden, false);
    assert.equal(f.lines.length, 0);
  }
});
test("stale token response cannot replace newer connection", async () => {
  const pending = [];
  const f = setup(() => new Promise((resolve) => pending.push(resolve)));
  const first = f.P.connect(), second = f.P.connect();
  pending[1]({ ok: true, json: async () => ({ token: "new" }) }); await second;
  pending[0]({ ok: true, json: async () => ({ token: "old" }) }); await first;
  assert.equal(f.lines.length, 1);
  f.P.disconnect();
});
test("actual missing setting names are shown without displaying arbitrary server data", async () => {
  const f = setup(async () => ({
    ok: false, status: 503,
    json: async () => ({ code: "SERVER_CONFIG_MISSING", missing: ["PANEL_BROKER_SEALED", "private-value"] })
  }));
  await f.P.connect();
  assert.match(f.element("statusText").textContent, /PANEL_BROKER_SEALED/);
  assert.doesNotMatch(f.element("statusText").textContent, /private-value/);
});
test("GitHub Pages is explicitly identified as unsupported server hosting", async () => {
  const f = setup();
  f.root.location = { hostname: "kmkspu36.github.io" };
  await f.P.connect();
  assert.match(f.element("statusText").textContent, /GitHub Pages/);
  assert.equal(f.requests.length, 0);
});
test("GitHub Pages uses hosted login when configured, without an anonymous token fetch", async () => {
  const f = setup();
  f.root.location = { hostname: "kmkspu36.github.io" };
  f.P.requestHostedToken = async () => ({ ok: true, json: async () => ({ token: "hosted-test" }) });
  await f.P.connect();
  assert.equal(f.requests.length, 0);
  assert.equal(f.lines.length, 1);
  f.lines[0].emit(2);
  assert.equal(f.P.connected, true);
  f.P.disconnect();
});
test("connection screen mirrors diagnostic and retry state", async () => {
  const f = setup(async () => ({
    ok: false, status: 502, json: async () => ({ code: "BROKER_REJECTED", upstreamStatus: 401 })
  }));
  await f.P.connect();
  assert.match(f.element("connectionDetail").textContent, /Broker HTTP 401/);
  assert.equal(f.element("retryConnectionScreen").hidden, false);
  assert.equal(f.element("webchat").hidden, true);
  assert.equal(f.element("offlineComposer").hidden, false);
});
test("attachment send requires verified capabilities and a live connection", async () => {
  const image = new File(["test"], "test.png", { type: "image/png" });
  const f = setup();
  await f.P.connect(); f.lines[0].emit(2);
  assert.equal(f.P.sendAttachments([image], "analyze"), false);
  f.P.disconnect();
  const verified = setup(async () => ({
    ok: true, json: async () => ({ token: "test-token", uploads: { verified: true, maxFiles: 1, maxBytes: 1024 } })
  }));
  await verified.P.connect();
  assert.equal(verified.P.sendAttachments([image], "analyze"), false);
  verified.lines[0].emit(2);
  assert.equal(verified.P.sendAttachments([image], "analyze"), true);
  const action = verified.dispatched[0];
  assert.equal(action.type, "WEB_CHAT/SEND_MESSAGE");
  assert.equal(action.payload.text, "analyze");
  assert.equal(action.payload.attachments[0].blob, image);
  assert.equal(verified.P.sendAttachments([image, image], "too many"), false);
  assert.equal(verified.P.sendAttachments([new File(["data"], "bad.svg", { type: "image/svg+xml" })], ""), false);
  verified.P.disconnect();
  assert.equal(verified.P.uploadCapabilities, null);
});
