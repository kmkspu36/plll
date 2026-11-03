"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/functions/chatToken.js"), "utf8");
function setup(options = {}) {
  let calls = 0;
  const context = {
    require: () => ({ app: { http() {} } }), module: { exports: {} }, Buffer, URL, AbortSignal,
    process: { env: Object.assign({
      PANEL_BROKER_URL: "https://broker.example/token", PANEL_BROKER_SEALED: "test-only",
      PANEL_ALLOWED_ORIGIN: "https://panel.example"
    }, options.env) },
    fetch: async (url, init) => {
      calls++;
      assert.equal(init.redirect, "error");
      assert.deepEqual(JSON.parse(init.body), { sealed: "test-only" });
      if (options.throw) throw new Error("test failure");
      return options.response || { ok: true, json: async () => ({ token: "short-lived-test-token", secret: "not-forwarded" }) };
    }
  };
  vm.runInNewContext(source, context);
  const principal = Buffer.from(JSON.stringify({ userRoles: ["authenticated"] })).toString("base64");
  return {
    call: (headers = {}) => context.module.exports.chatToken({
      headers: new Headers(Object.assign({
        origin: "https://panel.example", "x-ms-client-principal": principal
      }, headers))
    }),
    calls: () => calls
  };
}
test("token response excludes upstream extra fields and disables caching", async () => {
  const result = await setup().call();
  assert.equal(result.status, 200);
  assert.equal(JSON.stringify(result.jsonBody), '{"token":"short-lived-test-token"}');
  assert.equal(result.headers["Cache-Control"], "no-store");
});
test("missing configuration fails closed", async () => {
  const fixture = setup({ env: { PANEL_BROKER_SEALED: "" } });
  assert.equal((await fixture.call()).status, 503);
  assert.equal(fixture.calls(), 0);
});
test("origin and principal are required", async () => {
  const fixture = setup();
  assert.equal((await fixture.call({ origin: "https://other.example" })).status, 403);
  assert.equal((await fixture.call({ "x-ms-client-principal": "" })).status, 401);
  assert.equal((await fixture.call({ "x-ms-client-principal": "invalid" })).status, 401);
  const anonymous = Buffer.from('{"userRoles":["anonymous"]}').toString("base64");
  assert.equal((await fixture.call({ "x-ms-client-principal": anonymous })).status, 401);
  assert.equal(fixture.calls(), 0);
});
test("HTTP broker URL is refused", async () => {
  assert.equal((await setup({ env: { PANEL_BROKER_URL: "http://broker.example" } }).call()).status, 503);
});
test("upstream errors never forward broker body", async () => {
  assert.equal((await setup({ response: { ok: false, status: 401 } }).call()).status, 502);
  assert.equal((await setup({ response: { ok: false, status: 429 } }).call()).status, 429);
  assert.equal((await setup({ response: { ok: true, json: async () => ({ token: "" }) } }).call()).status, 502);
  assert.equal((await setup({ throw: true }).call()).status, 502);
});
