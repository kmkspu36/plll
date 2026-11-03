(function (root) {
  "use strict";
  var KEY = "panellab.engineering.v1";
  var states = { waiting: "대기", running: "진행 중", review: "사용자 확인 필요", complete: "완료", failed: "오류 발생" };
  var fields = {
    io: ["kind", "address", "name", "description"],
    labels: ["name", "address", "dataType", "description"],
    issues: ["kind", "location", "cause", "suggestion", "status", "sourceKey"],
    evidence: ["fileId", "location", "address", "variable", "uncertainty", "sourceKey"]
  };
  var data = { schema: 1, records: [], versions: [], stages: [] }, blocked = false;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message) { throw new Error(message); }
  function text(value, required, max) {
    if (typeof value !== "string" || value.length > (max || 4000) || (required && !value.trim())) fail("필수 항목과 입력 길이를 확인하세요.");
    return value.trim();
  }
  function validate(value) {
    if (!value || value.schema !== 1 || !Array.isArray(value.records) || !Array.isArray(value.versions) || !Array.isArray(value.stages)) fail("엔지니어링 저장 형식이 올바르지 않습니다.");
    var ids = new Set();
    value.records.concat(value.versions, value.stages).forEach(function (item) {
      if (!item || typeof item !== "object") fail("저장 항목이 올바르지 않습니다.");
      text(item.id, true, 150); text(item.projectId, true, 150); text(item.createdAt, true, 50);
      if (isNaN(Date.parse(item.createdAt)) || ids.has(item.id)) fail("기록 ID 또는 날짜가 올바르지 않습니다.");
      ids.add(item.id);
    });
    value.records.forEach(function (item) {
      if (!Object.prototype.hasOwnProperty.call(fields, item.kind)) fail("지원하지 않는 엔지니어링 기록입니다.");
      fields[item.kind].forEach(function (key) { text(item.values && item.values[key], false); });
    });
    value.versions.forEach(function (item) {
      text(item.code, true, 500000); text(item.title, true, 200); text(item.sourceKey, false, 500);
      text(item.restoredFrom || "", false, 150);
    });
    value.stages.forEach(function (item) {
      if (!Object.prototype.hasOwnProperty.call(states, item.state) ||
          !Object.prototype.hasOwnProperty.call(root.PanelLab.data.taskLabels, item.task)) fail("작업 상태가 올바르지 않습니다.");
      text(item.sourceKey, false, 500); text(item.note, true);
    });
    return value;
  }
  try {
    var stored = root.localStorage.getItem(KEY);
    if (stored) data = validate(JSON.parse(stored));
  } catch (error) {
    blocked = true;
    root.setTimeout(function () { root.dispatchEvent(new CustomEvent("panellab:error", {
      detail: "엔지니어링 저장소를 읽지 못했습니다. 원본 보호를 위해 변경을 차단했습니다. " + error.message
    })); }, 0);
  }
  function project(id) {
    if (!root.PanelLab.data.projects().some(function (item) { return item.id === id; })) fail("프로젝트를 찾지 못했습니다.");
  }
  function source(projectId, key) {
    return root.PanelLab.data.resultsFor(projectId).find(function (item) { return item.key === key; });
  }
  function commit(next) {
    if (blocked) fail("저장소 복구가 필요합니다. 기존 자료를 덮어쓰지 않습니다.");
    validate(next);
    try { root.localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (error) { fail("저장에 실패했습니다. 브라우저 용량과 권한을 확인하세요."); }
    data = next;
    root.dispatchEvent(new CustomEvent("panellab:engineering"));
  }
  function base(projectId) {
    project(projectId);
    return { id: root.crypto.randomUUID(), projectId: projectId, createdAt: new Date().toISOString() };
  }
  function list(projectId, kind) {
    return clone(data.records.filter(function (item) { return item.projectId === projectId && (!kind || item.kind === kind); }));
  }
  function addRecord(projectId, kind, values, replacingId) {
    if (!Object.prototype.hasOwnProperty.call(fields, kind)) fail("지원하지 않는 기록입니다.");
    var record = base(projectId); record.kind = kind; record.values = {};
    fields[kind].forEach(function (key) { record.values[key] = text(values[key] || "", false); });
    if (kind === "io") {
      text(record.values.address, true);
      if (["input", "output", "device"].indexOf(record.values.kind) < 0) fail("주소 종류를 선택하세요.");
    }
    if (kind === "labels") text(record.values.name, true);
    if (kind === "issues") {
      text(record.values.kind, true);
      if (["open", "review", "resolved"].indexOf(record.values.status) < 0) fail("오류 처리 상태를 선택하세요.");
    }
    if (kind === "evidence") {
      text(record.values.location, true);
      if (!record.values.fileId && !record.values.sourceKey) fail("도면 근거의 파일 또는 실제 결과를 연결하세요.");
    }
    if (record.values.sourceKey && !source(projectId, record.values.sourceKey)) fail("같은 프로젝트의 실제 결과를 선택하세요.");
    var next = clone(data);
    if (replacingId) {
      var index = next.records.findIndex(function (item) { return item.id === replacingId && item.projectId === projectId && item.kind === kind; });
      if (index < 0) fail("수정할 프로젝트 기록을 찾지 못했습니다.");
      record.id = replacingId; record.createdAt = next.records[index].createdAt;
      record.updatedAt = new Date().toISOString();
      record.history = (next.records[index].history || []).concat([{ values: next.records[index].values, changedAt: record.updatedAt }]);
      next.records[index] = record;
    } else next.records.push(record);
    commit(next);
    return clone(record);
  }
  function updateIssue(projectId, id, status) {
    project(projectId);
    if (["open", "review", "resolved"].indexOf(status) < 0) fail("오류 처리 상태를 확인하세요.");
    var next = clone(data), record = next.records.find(function (item) { return item.projectId === projectId && item.id === id && item.kind === "issues"; });
    if (!record) fail("해당 프로젝트의 오류 기록을 찾지 못했습니다.");
    record.values.status = status; record.updatedAt = new Date().toISOString(); commit(next);
  }
  function versions(projectId) { return clone(data.versions.filter(function (item) { return item.projectId === projectId; })); }
  function addVersion(projectId, code, title, sourceKey, restoredFrom) {
    var item = base(projectId);
    text(code, true, 500000); item.code = code; item.title = text(title, true, 200); item.sourceKey = text(sourceKey || "", false, 500);
    item.restoredFrom = restoredFrom || "";
    if (item.sourceKey && !source(projectId, item.sourceKey)) fail("버전의 원본 결과를 찾지 못했습니다.");
    var next = clone(data); next.versions.push(item); commit(next); return clone(item);
  }
  function restoreVersion(projectId, id) {
    var item = data.versions.find(function (version) { return version.projectId === projectId && version.id === id; });
    if (!item) fail("해당 프로젝트의 버전을 찾지 못했습니다.");
    return addVersion(projectId, item.code, "복원: " + item.title.slice(0, 180), "", item.id);
  }
  function stage(projectId, task) {
    var matches = data.stages.filter(function (item) { return item.projectId === projectId && item.task === task; });
    if (!matches.length) return null;
    var last = matches[matches.length - 1];
    var p = root.PanelLab.data.projects().find(function (item) { return item.id === projectId; });
    if (!p || (p.requests || []).some(function (request) { return request.task === task && request.requestedAt > last.createdAt; })) return null;
    var requests = (p.requests || []).filter(function (request) { return request.task === task; });
    if (Object.prototype.hasOwnProperty.call(last, "requestId") &&
        last.requestId !== (requests.length ? requests[requests.length - 1].id : "")) return null;
    if (last.state === "complete") {
      var result = source(projectId, last.sourceKey);
      if (!result || result.task !== task) return null;
    }
    return clone(last);
  }
  function setStage(projectId, task, state, sourceKey, note) {
    var item = base(projectId); item.task = task; item.state = state;
    item.sourceKey = text(sourceKey || "", false, 500); item.note = text(note, true);
    if (!Object.prototype.hasOwnProperty.call(states, state) ||
        !Object.prototype.hasOwnProperty.call(root.PanelLab.data.taskLabels, task)) fail("작업 단계와 상태를 확인하세요.");
    if (item.sourceKey && !source(projectId, item.sourceKey)) fail("같은 프로젝트의 결과가 필요합니다.");
    if (state === "complete" || state === "review") {
      var result = source(projectId, item.sourceKey);
      if (!result || result.task !== task) fail("이 단계로 분류된 실제 결과를 먼저 연결하세요.");
    }
    var p = root.PanelLab.data.projects().find(function (entry) { return entry.id === projectId; });
    if (state === "running" && !(p.requests || []).some(function (entry) { return entry.task === task; })) fail("실제 요청 기록이 필요합니다.");
    var requests = (p.requests || []).filter(function (request) { return request.task === task; });
    item.requestId = requests.length ? requests[requests.length - 1].id : "";
    var next = clone(data); next.stages.push(item); commit(next); return clone(item);
  }
  function progress(projectId) {
    var complete = Object.keys(root.PanelLab.data.taskLabels).filter(function (task) {
      var entry = stage(projectId, task); return entry && entry.state === "complete";
    }).length;
    return { complete: complete, total: 7 };
  }
  function diagnostics(projectId) {
    var records = list(projectId), warnings = [], addresses = new Map(), names = new Set();
    records.forEach(function (record) {
      var v = record.values;
      if (record.kind === "labels") {
        var name = v.name.toUpperCase();
        if (names.has(name)) warnings.push("라벨명 중복 후보: " + v.name);
        names.add(name);
      }
      if (record.kind === "io" && v.address) {
        var address = v.address.replace(/\s+/g, "").toUpperCase();
        if (addresses.has(address)) warnings.push("I/O 주소 중복 후보: " + address);
        addresses.set(address, record.id);
      }
    });
    records.filter(function (record) { return record.kind === "evidence"; }).forEach(function (record) {
      record.values.variable.split(/[,;\n]/).map(function (value) { return value.trim(); }).filter(Boolean).forEach(function (name) {
        if (!names.has(name.toUpperCase())) warnings.push("등록된 글로벌 라벨에서 찾지 못한 참조: " + name);
      });
    });
    return warnings;
  }
  root.PanelLab.engineering = {
    fields: fields, states: states, list: list, addRecord: addRecord, updateIssue: updateIssue,
    versions: versions, addVersion: addVersion, restoreVersion: restoreVersion,
    stage: stage, setStage: setStage, progress: progress, diagnostics: diagnostics,
    snapshot: function (projectId) {
      return clone({ schema: 1, records: data.records.filter(function (item) { return item.projectId === projectId; }),
        versions: data.versions.filter(function (item) { return item.projectId === projectId; }),
        stages: data.stages.filter(function (item) { return item.projectId === projectId; }) });
    },
    validate: validate
  };
})(window);
