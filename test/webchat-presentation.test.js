"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function setup(clipboard) {
  const events = [], observations = [], frames = new Map();
  let next = 0, disconnected = 0;
  const root = { PanelLab: {}, navigator: { clipboard }, dispatchEvent: event => events.push(event),
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id) };
  function element(tag) {
    return { tag, dataset: {}, children: [], textContent: "", classList: { add() {} },
      appendChild(child) { this.children.push(child); },
      insertBefore(child) { this.children.unshift(child); } };
  }
  const code = element("code"); code.textContent = "  LD X0\n  OUT Y0\n";
  const pre = element("pre"); pre.children.push(code); pre.querySelector = () => code;
  const container = { querySelectorAll: () => [pre] };
  const sandbox = { window: root, document: { createElement: element },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { constructor(callback) { observations.push(callback); } observe() {} disconnect() { disconnected++; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "webchat-presentation.js"), "utf8"), sandbox);
  return { P: root.PanelLab, pre, code, container, events, observations, frames, disconnected: () => disconnected };
}
test("native code display adds one copy control without changing source text", async () => {
  const copied = [], f = setup({ writeText: async text => copied.push(text) });
  f.P.presentation.decorate(f.container); f.P.presentation.decorate(f.container);
  assert.equal(f.pre.children.length, 2);
  assert.equal(f.pre.children[1], f.code);
  await f.pre.children[0].children[1].onclick();
  assert.equal(copied[0], "  LD X0\n  OUT Y0\n");
});
test("clipboard failure is surfaced, never reported as copied", async () => {
  const f = setup({ writeText: async () => { throw new Error("denied"); } });
  f.P.presentation.decorate(f.container);
  const button = f.pre.children[0].children[1];
  await button.onclick();
  assert.equal(button.textContent, "코드 복사");
  assert.match(f.events[0].detail, /denied/);
});
test("presentation observer is disposed and scheduled decoration cancelled", () => {
  const f = setup(); f.P.presentation.observe(f.container);
  f.observations[0]();
  assert.equal(f.frames.size, 1);
  f.P.presentation.stop();
  assert.equal(f.frames.size, 0); assert.equal(f.disconnected(), 1);
});
