"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { handler } = require("../netlify/functions/chat-token");
const SITE = "https://superb-fudge-1fb499.netlify.app";

test("Netlify rejects methods, foreign origins and forged Azure principals before upstream access", async () => {
  const saved = global.fetch;
  global.fetch = async () => { throw new Error("must not fetch"); };
  try {
    for (const [event, expected] of [
      [{ httpMethod: "GET", headers: {} }, 405],
      [{ httpMethod: "POST", headers: { origin: "https://other.example" } }, 403],
      [{ httpMethod: "POST", headers: { origin: SITE, "x-ms-client-principal": "forged" } }, 401]
    ]) assert.equal((await handler(event)).statusCode, expected);
  } finally { global.fetch = saved; }
});

test("Netlify verifies Identity against its fixed host and forwards only verified users to the Broker", async () => {
  const savedFetch = global.fetch, savedEnv = { ...process.env };
  process.env.PANEL_BROKER_URL = "https://broker.example/token";
  process.env.PANEL_BROKER_SEALED = "test-server-only";
  process.env.PANEL_ALLOWED_ORIGIN = SITE;
  process.env.PANEL_BROKER_ORIGIN = "https://kmkspu36.github.io";
  const requests = [];
  let identityStatus = 401, user = null;
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/.netlify/identity/user")) {
      return { status: identityStatus, ok: identityStatus === 200, json: async () => user };
    }
    return { ok: true, json: async () => ({ token: "direct-line-test" }) };
  };
  const event = { httpMethod: "POST", headers: { origin: SITE, authorization: "Bearer identity-test" } };
  try {
    assert.equal((await handler(event)).statusCode, 401);
    assert.equal(requests.length, 1);
    identityStatus = 200;
    user = { id: "unconfirmed" };
    assert.equal((await handler(event)).statusCode, 401);
    assert.equal(requests.length, 2);
    user = { id: "invited-user", confirmed_at: "2026-01-01" };
    const result = await handler(event);
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).token, "direct-line-test");
    assert.doesNotMatch(result.body, /test-server-only|identity-test/);
    assert.equal(requests[0].url, SITE + "/.netlify/identity/user");
    assert.equal(requests.at(-1).options.headers.Origin, "https://kmkspu36.github.io");
    assert.equal(requests.at(-1).options.headers.Authorization, undefined);
  } finally {
    global.fetch = savedFetch;
    for (const name of Object.keys(process.env)) if (!(name in savedEnv)) delete process.env[name];
    Object.assign(process.env, savedEnv);
  }
});

test("Netlify publish directory is built from an explicit public-file allowlist", () => {
  const config = fs.readFileSync(require.resolve("../netlify.toml"), "utf8");
  const build = fs.readFileSync(require.resolve("../netlify/build.cjs"), "utf8");
  assert.match(config, /publish = "\.netlify-public"/);
  assert.match(config, /npm ci --prefix api/);
  assert.match(build, /\["index.html", "auth.html", "css", "js"\]/);
  assert.doesNotMatch(build, /cpSync.*(?:api|settings|process\.env)/);
});
