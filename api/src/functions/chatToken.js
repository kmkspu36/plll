"use strict";
const { app } = require("@azure/functions");

async function chatToken(request) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  const reply = (status, code, details = {}) => ({ status, headers, jsonBody: { code, ...details } });
  const broker = process.env.PANEL_BROKER_URL;
  const sealed = process.env.PANEL_BROKER_SEALED;
  const origin = process.env.PANEL_ALLOWED_ORIGIN;
  const brokerOrigin = process.env.PANEL_BROKER_ORIGIN || origin;
  const missing = [
    !broker && "PANEL_BROKER_URL", !sealed && "PANEL_BROKER_SEALED", !origin && "PANEL_ALLOWED_ORIGIN"
  ].filter(Boolean);
  if (missing.length) return reply(503, "SERVER_CONFIG_MISSING", { missing });
  let url;
  try {
    url = new URL(broker);
    if (new URL(origin).origin !== origin) return reply(503, "SERVER_CONFIG_INVALID");
    const upstreamOrigin = new URL(brokerOrigin);
    if (upstreamOrigin.origin !== brokerOrigin || !["http:", "https:"].includes(upstreamOrigin.protocol)) {
      return reply(503, "SERVER_CONFIG_INVALID");
    }
  } catch { return reply(503, "SERVER_CONFIG_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password) return reply(503, "SERVER_CONFIG_INVALID");
  if (request.headers.get("origin") !== origin) return reply(403, "ORIGIN_DENIED");
  // Only trust this header behind Azure's authenticated, access-restricted proxy.
  const principal = request.headers.get("x-ms-client-principal");
  if (!principal) return reply(401, "LOGIN_REQUIRED");
  try {
    const user = JSON.parse(Buffer.from(principal, "base64").toString("utf8"));
    if (!user || !Array.isArray(user.userRoles) || !user.userRoles.includes("authenticated")) {
      return reply(401, "LOGIN_REQUIRED");
    }
  } catch { return reply(401, "LOGIN_REQUIRED"); }
  try {
    const response = await fetch(url, {
      method: "POST", headers: { Origin: brokerOrigin }, body: JSON.stringify({ sealed }),
      signal: AbortSignal.timeout(15000), redirect: "error"
    });
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, "BROKER_REJECTED", { upstreamStatus: response.status });
    let data;
    try { data = await response.json(); } catch { return reply(502, "BROKER_INVALID_JSON"); }
    if (!data || typeof data.token !== "string" || !data.token.trim()) return reply(502, "BROKER_TOKEN_MISSING");
    const uploadVerified = process.env.PANEL_IMAGE_UPLOAD_VERIFIED === "1";
    const maxFiles = Number(process.env.PANEL_UPLOAD_MAX_FILES || 1);
    const maxBytes = Number(process.env.PANEL_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 5 ||
        !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 15 * 1024 * 1024) {
      return reply(503, "SERVER_CONFIG_INVALID");
    }
    return {
      status: 200, headers,
      jsonBody: { token: data.token, uploads: { verified: uploadVerified, maxFiles, maxBytes } }
    };
  } catch (error) {
    return reply(502, error.name === "TimeoutError" || error.name === "AbortError" ? "BROKER_TIMEOUT" : "BROKER_NETWORK_ERROR");
  }
}

app.http("chatToken", { methods: ["POST"], authLevel: "anonymous", handler: chatToken });
module.exports = { chatToken };
