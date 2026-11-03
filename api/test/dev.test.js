"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../dev");

async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test("serves frontend but never private server files", async (t) => {
  const url = await fixture(t);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /PanelLab/);
  assert.equal((await fetch(url + "/js/connection.js")).status, 200);
  for (const file of ["/api/local.settings.json", "/.git", "/api/dev.js", "/README.md", "/node_modules/test.js", "/js/%2e%2e/api/dev.js"]) {
    assert.equal((await fetch(url + file)).status, 404, file);
  }
});
test("token path executes real handler and reports actual missing configuration", async (t) => {
  const before = process.env.PANEL_BROKER_SEALED;
  delete process.env.PANEL_BROKER_SEALED;
  t.after(() => { if (before === undefined) delete process.env.PANEL_BROKER_SEALED; else process.env.PANEL_BROKER_SEALED = before; });
  const url = await fixture(t);
  const response = await fetch(url + "/api/chatToken", { method: "POST", headers: { origin: url } });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "SERVER_CONFIG_MISSING");
  assert.ok(body.missing.includes("PANEL_BROKER_SEALED"));
});
test("rejects foreign origin and does not trust browser supplied principal", async (t) => {
  const before = process.env.PANEL_LOCAL_DEVELOPMENT;
  delete process.env.PANEL_LOCAL_DEVELOPMENT;
  t.after(() => { if (before === undefined) delete process.env.PANEL_LOCAL_DEVELOPMENT; else process.env.PANEL_LOCAL_DEVELOPMENT = before; });
  let called = false;
  const url = await fixture(t, async ({ headers }) => {
    called = true;
    assert.equal(headers.get("x-ms-client-principal"), null);
    return { status: 401, headers: {}, jsonBody: { code: "LOGIN_REQUIRED" } };
  });
  assert.equal((await fetch(url + "/api/chatToken", { method: "POST", headers: { origin: "https://other.example" } })).status, 403);
  assert.equal(called, false);
  const response = await fetch(url + "/api/chatToken", {
    method: "POST", headers: { origin: url, "x-ms-client-principal": "untrusted-header" }
  });
  assert.equal(response.status, 401);
  assert.equal(called, true);
});
