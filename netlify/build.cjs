"use strict";
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "..", ".netlify-public");
fs.mkdirSync(output, { recursive: true });
for (const name of ["index.html", "auth.html", "css", "js"]) {
  fs.cpSync(path.join(__dirname, "..", name), path.join(output, name), { recursive: true });
}
