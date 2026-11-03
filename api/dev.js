"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chatToken } = require("./src/functions/chatToken");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };

function loadSettings() {
  const file = path.join(__dirname, "local.settings.json");
  if (!fs.existsSync(file)) return;
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!settings.Values || typeof settings.Values !== "object") throw new Error("local.settings.json must contain Values");
  for (const [key, value] of Object.entries(settings.Values)) {
    if (typeof value !== "string") throw new Error("local.settings.json values must be strings");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createServer(handler = chatToken) {
  return http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const address = req.socket.localAddress;
    const host = `127.0.0.1:${req.socket.localPort}`;
    if (address !== "127.0.0.1" || req.headers.host !== host) return reply(403, { code: "LOCAL_HOST_DENIED" });
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname); }
    catch { return reply(400, { code: "INVALID_PATH" }); }
    if (pathname === "/api/chatToken") {
      if (req.method !== "POST") return reply(405, { code: "METHOD_NOT_ALLOWED" });
      if (req.headers.origin !== `http://${host}`) return reply(403, { code: "ORIGIN_DENIED" });
      const headers = new Headers({ origin: req.headers.origin });
      // Local-only opt-in replaces Azure's trusted proxy, never caller-provided identity.
      if (process.env.PANEL_LOCAL_DEVELOPMENT === "1") {
        headers.set("x-ms-client-principal", Buffer.from(JSON.stringify({ userRoles: ["authenticated"] })).toString("base64"));
      }
      try {
        const result = await handler({ headers });
        res.writeHead(result.status, result.headers);
        res.end(JSON.stringify(result.jsonBody));
      } catch (error) {
        console.error("PanelLab local token handler failed:", error.name);
        reply(500, { code: "SERVER_INTERNAL_ERROR" });
      }
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return reply(405, { code: "METHOD_NOT_ALLOWED" });
    // Serve only the frontend, never server settings, source, Git data or dependencies.
    const publicFile = pathname === "/" || pathname === "/index.html" ||
      /^\/(?:js|css)\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(pathname);
    if (!publicFile) return reply(404, { code: "NOT_FOUND" });
    const file = pathname === "/" ? path.join(root, "index.html") : path.join(root, pathname);
    try {
      const content = await fs.promises.readFile(file);
      res.writeHead(200, { "Content-Type": mime[path.extname(file)], "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (error.code === "ENOENT") return reply(404, { code: "NOT_FOUND" });
      console.error("PanelLab static file read failed:", error.code);
      reply(500, { code: "STATIC_READ_FAILED" });
    }
  });
}

if (require.main === module) {
  loadSettings();
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const server = createServer();
  server.on("error", (error) => { console.error("PanelLab server failed:", error.code); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => {
    console.log(`PanelLab: http://127.0.0.1:${port} (real token handler; no credentials printed)`);
  });
}
module.exports = { createServer, loadSettings };
