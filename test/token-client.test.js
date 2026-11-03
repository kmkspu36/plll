"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(require.resolve("../js/token-client.js"), "utf8");
function setup(origin = "https://kmkspu36.github.io") {
  const listeners = new Map(), popup = { closed: false, close() { this.closed = true; } };
  let opened;
  const root = {
    location: { origin, hash: "", replace() {} },
    navigator: { userActivation: { isActive: true } }, crypto: webcrypto,
    open(url) { opened = new URL(url); return popup; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); }
  };
  vm.runInNewContext(source, { window: root, URLSearchParams, Uint8Array, setInterval, clearInterval });
  return { root, listeners, popup, opened: () => opened };
}
test("hosted login requires a user gesture and leaves loopback connections untouched", async () => {
  assert.equal(setup("http://127.0.0.1:4174").root.PanelLab, undefined);
  const f = setup();
  f.root.navigator.userActivation.isActive = false;
  await assert.rejects(f.root.PanelLab.requestHostedToken(new AbortController().signal), /다시 연결/);
});
test("popup token requires exact origin, window identity and random state", async () => {
  const f = setup(), controller = new AbortController();
  const promise = f.root.PanelLab.requestHostedToken(controller.signal);
  const state = f.opened().searchParams.get("state");
  assert.match(state, /^[a-f0-9]{64}$/);
  const receive = f.listeners.get("message");
  const data = { type: "panellab:token", state, data: { token: "actual-test" } };
  receive({ origin: "https://evil.example", source: f.popup, data });
  receive({ origin: f.opened().origin, source: {}, data });
  receive({ origin: f.opened().origin, source: f.popup, data: { ...data, state: "wrong" } });
  assert.equal(f.popup.closed, false);
  receive({ origin: f.opened().origin, source: f.popup, data });
  assert.equal((await (await promise).json()).token, "actual-test");
  assert.equal(f.listeners.size, 0);
});
test("aborting hosted login closes popup and removes listeners", async () => {
  const f = setup(), controller = new AbortController();
  const promise = f.root.PanelLab.requestHostedToken(controller.signal);
  controller.abort();
  await assert.rejects(promise, /취소/);
  assert.equal(f.popup.closed, true);
  assert.equal(f.listeners.size, 0);
});
