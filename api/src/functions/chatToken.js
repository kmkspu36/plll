"use strict";
const { app } = require("@azure/functions");

async function chatToken(request) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  const reply = (status, error) => ({ status, headers, jsonBody: { error } });
  const broker = process.env.PANEL_BROKER_URL;
  const sealed = process.env.PANEL_BROKER_SEALED;
  const origin = process.env.PANEL_ALLOWED_ORIGIN;
  if (!broker || !sealed || !origin) return reply(503, "Server configuration required");
  let url;
  try { url = new URL(broker); } catch { return reply(503, "Invalid broker configuration"); }
  if (url.protocol !== "https:" || url.username || url.password) return reply(503, "Invalid broker configuration");
  if (request.headers.get("origin") !== origin) return reply(403, "Origin not allowed");
  // Only trust this header behind Azure's authenticated, access-restricted proxy.
  const principal = request.headers.get("x-ms-client-principal");
  if (!principal) return reply(401, "Authentication required");
  try {
    const user = JSON.parse(Buffer.from(principal, "base64").toString("utf8"));
    if (!user || !Array.isArray(user.userRoles) || !user.userRoles.includes("authenticated")) {
      return reply(401, "Authentication required");
    }
  } catch { return reply(401, "Authentication required"); }
  try {
    const response = await fetch(url, {
      method: "POST", body: JSON.stringify({ sealed }),
      signal: AbortSignal.timeout(15000), redirect: "error"
    });
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, "Broker request failed");
    const data = await response.json();
    if (!data || typeof data.token !== "string" || !data.token.trim()) return reply(502, "Invalid broker response");
    return { status: 200, headers, jsonBody: { token: data.token } };
  } catch { return reply(502, "Broker unavailable"); }
}

app.http("chatToken", { methods: ["POST"], authLevel: "anonymous", handler: chatToken });
module.exports = { chatToken };
