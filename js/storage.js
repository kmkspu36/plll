(function (root) {
  "use strict";
  var database;
  var LEGACY_KEYS = ["panellab.projects.v1", "panellab.results.v1", "panellab.activeProject.v1", "panellab.conversations.v1"];
  function open() {
    if (!root.indexedDB) return Promise.reject(new Error("이 브라우저는 IndexedDB 파일 보관을 지원하지 않습니다."));
    if (!database) {
      database = new Promise(function (resolve, reject) {
        var request = root.indexedDB.open("panellab.workspace.v1", 1);
        request.onupgradeneeded = function () {
          var db = request.result;
          db.createObjectStore("files", { keyPath: "id" }).createIndex("projectId", "projectId");
          db.createObjectStore("snapshots", { keyPath: "id" });
        };
        request.onerror = function () { database = null; reject(new Error("파일 저장소를 열지 못했습니다. 브라우저 권한과 용량을 확인하세요.")); };
        request.onblocked = function () {
          root.dispatchEvent(new CustomEvent("panellab:error", { detail: "저장소 업데이트가 다른 탭에 의해 대기 중입니다. 다른 PanelLab 탭을 닫아 주세요." }));
        };
        request.onsuccess = function () {
          var db = request.result;
          db.onversionchange = function () { db.close(); database = null; };
          resolve(db);
        };
      });
    }
    return database;
  }
  async function transaction(store, mode, action) {
    var db = await open();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, mode), result;
      tx.oncomplete = function () { resolve(result); };
      tx.onabort = function () { reject(new Error("저장 작업에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.")); };
      tx.onerror = function () { /* onabort reports the transaction failure. */ };
      try {
        var request = action(tx.objectStore(store));
        request.onsuccess = function () { result = request.result; };
      } catch (error) { tx.abort(); }
    });
  }
  function validateFile(record) {
    if (!record || typeof record.id !== "string" || !record.id ||
        typeof record.projectId !== "string" || !record.projectId ||
        typeof record.name !== "string" || !(record.blob instanceof Blob)) {
      throw new Error("파일과 프로젝트 정보가 올바르지 않습니다.");
    }
    if (record.blob.size > 15 * 1024 * 1024) throw new Error("로컬 파일 보관은 파일당 최대 15MB입니다.");
  }
  async function saveFile(record) {
    validateFile(record);
    await transaction("files", "readwrite", function (store) { return store.put(record); });
    return record.id;
  }
  async function backupLegacy() {
    var values = {};
    LEGACY_KEYS.forEach(function (key) {
      var raw = root.localStorage.getItem(key);
      if (raw !== null) {
        var parsed = JSON.parse(raw);
        if (key !== "panellab.activeProject.v1" && !Array.isArray(parsed)) throw new Error("기존 저장 형식을 확인해야 합니다. 원본은 변경하지 않았습니다.");
        values[key] = raw;
      }
    });
    var snapshot = { id: root.crypto.randomUUID(), createdAt: new Date().toISOString(), values: values };
    await transaction("snapshots", "readwrite", function (store) { return store.put(snapshot); });
    return snapshot;
  }
  root.PanelLab.storage = {
    saveFile: saveFile,
    filesFor: function (projectId) {
      return transaction("files", "readonly", function (store) { return store.index("projectId").getAll(projectId); });
    },
    getFile: function (id) { return transaction("files", "readonly", function (store) { return store.get(id); }); },
    removeFile: function (id) { return transaction("files", "readwrite", function (store) { return store.delete(id); }); },
    backupLegacy: backupLegacy,
    validateFile: validateFile
  };
})(window);
