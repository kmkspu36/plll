"use strict";
const { chatToken } = require("../../api/src/functions/chatToken");
const SITE = "https://superb-fudge-1fb499.netlify.app";

async function handler(event) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  const reply = (statusCode, code) => ({ statusCode, headers, body: JSON.stringify({ code }) });
  if (event.httpMethod !== "POST") return reply(405, "METHOD_NOT_ALLOWED");
  if (event.headers.origin !== SITE) return reply(403, "ORIGIN_DENIED");
  const authorization = event.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer [^\s]{1,8192}$/.test(authorization)) {
    return reply(401, "LOGIN_REQUIRED");
  }
  try {
    // Validate with this site's Identity service, never with a caller-provided issuer.
    const identity = await fetch(SITE + "/.netlify/identity/user", {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(8000), redirect: "error"
    });
    if (identity.status === 401 || identity.status === 403) return reply(401, "LOGIN_REQUIRED");
    if (!identity.ok) return reply(502, "IDENTITY_UNAVAILABLE");
    const user = await identity.json();
    if (!user || typeof user.id !== "string" || !user.id || !user.confirmed_at) {
      return reply(401, "LOGIN_REQUIRED");
    }
    // The Azure adapter receives only a principal constructed after server verification.
    // Incoming x-ms-client-principal is deliberately ignored.
    const result = await chatToken({
      headers: new Headers({
        origin: SITE,
        "x-ms-client-principal": Buffer.from(JSON.stringify({ userRoles: ["authenticated"] })).toString("base64")
      })
    });
    return { statusCode: result.status, headers: { ...result.headers, ...headers }, body: JSON.stringify(result.jsonBody) };
  } catch (error) {
    console.error("Netlify token request failed:", error.name);
    return reply(502, "IDENTITY_OR_TOKEN_UNAVAILABLE");
  }
}

exports.handler = handler;
