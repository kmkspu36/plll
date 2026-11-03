"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function setup(values = {}) {
  const storage = new Map(Object.entries(values));
  const root = {
    PanelLab: {}, crypto: { randomUUID: () => "snapshot" },
    localStorage: { getItem: (key) => storage.get(key) || null }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/storage.js"), "utf8"), { window: root, Blob });
  return { api: root.PanelLab.storage, storage };
}
test("requires valid project and Blob before persistence", () => {
  const { api } = setup();
  for (const record of [{}, { id: "1", projectId: "", name: "file", blob: new Blob() }, { id: "1", projectId: "p", name: "file", blob: "not-bytes" }]) {
    assert.throws(() => api.validateFile(record));
  }
  assert.doesNotThrow(() => api.validateFile({ id: "1", projectId: "p", name: "file", blob: new Blob(["data"]) }));
});
test("unsupported IndexedDB reports failure instead of saved success", async () => {
  const { api } = setup();
  await assert.rejects(api.saveFile({ id: "1", projectId: "p", name: "file", blob: new Blob(["data"]) }), /IndexedDB/);
});
test("malformed legacy storage is never changed or declared backed up", async () => {
  const { api, storage } = setup({ "panellab.projects.v1": "{broken" });
  await assert.rejects(api.backupLegacy());
  assert.equal(storage.get("panellab.projects.v1"), "{broken");
});
