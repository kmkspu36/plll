"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const window = { PanelLab: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/attachments.js"), "utf8"), { window, Uint8Array });
const validate = window.PanelLab.attachments.validate;
const png = new File([new Uint8Array([137,80,78,71,13,10,26,10])], "drawing.png", { type: "image/png" });
test("PNG and JPEG require matching extension, MIME and signature", async () => {
  await validate(png, 1024);
  await validate(new File([new Uint8Array([255,216,255,1])], "screen.JPEG", { type: "image/jpeg" }), 1024);
  await assert.rejects(validate(new File(["not an image"], "fake.png", { type: "image/png" }), 1024), /PNG/);
  await assert.rejects(validate(new File([png], "file.svg", { type: "image/svg+xml" }), 1024), /PNG/);
});
test("empty, oversized and disguised files cannot be staged", async () => {
  await assert.rejects(validate(new File([], "empty.jpg"), 1024), /빈 파일/);
  await assert.rejects(validate(png, 4), /크기/);
  await assert.rejects(validate(new File([png], "document.pdf", { type: "image/png" }), 1024), /PNG/);
});
