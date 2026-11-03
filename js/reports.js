(function (root) {
  "use strict";
  var P = root.PanelLab;
  var keys = ["panellab.projects.v1", "panellab.results.v1", "panellab.conversations.v1", "panellab.engineering.v1"];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function requireValue(ok, message) { if (!ok) throw new Error(message); }
  function validString(value, max) { return typeof value === "string" && value.length <= max; }
  function safeShape(value, depth) {
    requireValue(depth < 40, "백업의 중첩 단계가 너무 깊습니다.");
    if (!value || typeof value !== "object") return;
    Object.keys(value).forEach(function (key) {
      requireValue(["__proto__", "prototype", "constructor"].indexOf(key) < 0, "안전하지 않은 백업 필드입니다.");
      safeShape(value[key], depth + 1);
    });
  }
  function validate(pack) {
    safeShape(pack, 0);
    requireValue(pack && pack.format === "panellab-project" && pack.schema === 1, "지원하지 않는 백업 형식입니다.");
    var project = pack.project;
    requireValue(project && validString(project.id, 150) && project.id &&
      validString(project.name, 200) && project.name.trim(), "백업 프로젝트 정보가 올바르지 않습니다.");
    ["vendor", "software", "cpu", "description", "createdAt"].forEach(function (key) {
      requireValue(project[key] === undefined || validString(project[key], 4000), "프로젝트 필드를 확인하세요.");
    });
    requireValue(project.requests === undefined || Array.isArray(project.requests), "프로젝트 요청 이력을 확인하세요.");
    (project.requests || []).forEach(function (item) {
      requireValue(item && validString(item.id, 150) && validString(item.task, 100) &&
        validString(item.requestedAt, 100), "프로젝트 작업 요청을 확인하세요.");
    });
    requireValue(Array.isArray(pack.results) && Array.isArray(pack.conversations) && Array.isArray(pack.files), "백업 목록을 확인하세요.");
    P.engineering.validate(pack.engineering);
    var resultKeys = new Set(), conversationIds = new Set(), fileIds = new Set();
    pack.conversations.forEach(function (item) {
      requireValue(item && validString(item.id, 150) && item.id && !conversationIds.has(item.id) &&
        item.projectId === project.id && Array.isArray(item.activities), "대화 소유 관계 또는 ID가 올바르지 않습니다.");
      conversationIds.add(item.id);
      item.activities.forEach(function (entry) {
        requireValue(entry && ["incoming", "outgoing"].indexOf(entry.direction) >= 0 &&
          validString(entry.key, 1000) && validString(entry.time, 100) &&
          entry.activity && typeof entry.activity === "object", "대화 기록 형식을 확인하세요.");
      });
    });
    pack.results.forEach(function (item) {
      requireValue(item && item.projectId === project.id && validString(item.key, 500) && item.key &&
        !resultKeys.has(item.key) && item.data && typeof item.data === "object" &&
        validString(item.type, 100) && validString(item.receivedAt, 100), "결과 소유 관계 또는 형식이 올바르지 않습니다.");
      requireValue(!item.conversationId || conversationIds.has(item.conversationId), "결과의 원본 대화를 찾지 못했습니다.");
      resultKeys.add(item.key);
    });
    var bytes = 0;
    pack.files.forEach(function (item) {
      requireValue(item && item.projectId === project.id && validString(item.id, 150) && item.id && !fileIds.has(item.id) &&
        validString(item.name, 1000) && ["image/png", "image/jpeg"].indexOf(item.type) >= 0 &&
        validString(item.base64, 21 * 1024 * 1024) && /^[A-Za-z0-9+/]*={0,2}$/.test(item.base64), "백업 첨부 형식을 확인하세요.");
      fileIds.add(item.id); bytes += item.base64.length;
    });
    requireValue(bytes <= 70 * 1024 * 1024, "복원 첨부 총량이 너무 큽니다. 프로젝트를 나누어 보관하세요.");
    pack.engineering.records.concat(pack.engineering.versions, pack.engineering.stages).forEach(function (item) {
      requireValue(item.projectId === project.id, "다른 프로젝트의 엔지니어링 기록이 포함되어 있습니다.");
    });
    return pack;
  }
  function markdown(projectId) {
    var project = P.data.projects().find(function (item) { return item.id === projectId; });
    requireValue(project, "프로젝트를 찾지 못했습니다.");
    var lines = ["# PanelLab 통합 기록 보고서", "", "프로젝트: " + project.name,
      "설명: " + (project.description || "미입력"), "환경: " + (project.vendor || "미정") + " / " + project.software + " / " + (project.cpu || "CPU 미정"),
      "생성: " + new Date().toISOString(), "", "> 저장된 응답과 사용자 기록의 모음입니다. PLC 컴파일·실장비 검증 또는 새 AI 보고서가 아닙니다.", ""];
    Object.keys(P.data.taskLabels).forEach(function (task) {
      var stage = P.engineering.stage(projectId, task), results = P.data.resultsFor(projectId).filter(function (item) { return item.task === task; });
      lines.push("## " + P.data.taskLabels[task], "", "상태: " + (stage ? P.engineering.states[stage.state] + " (사용자 확인)" : "미확인"), "");
      if (stage) lines.push("확인 근거: " + stage.note, "근거 결과: " + (stage.sourceKey || "미연결"), "");
      if (!results.length) lines.push("연결된 실제 응답 없음.", "");
      results.forEach(function (item) {
        lines.push("### " + (item.title || item.type), "출처: " + item.key, "수신: " + item.receivedAt,
          "승인: " + (item.approval || "미확인"), "");
        if (item.rejectionReason) lines.push("거부 이유: " + item.rejectionReason, "");
        var original = item.original && item.original.text;
        var content = original || JSON.stringify(item.data, null, 2);
        var runs = content.match(/`+/g) || [];
        var fence = "`".repeat(Math.max.apply(null, [3].concat(runs.map(function (run) { return run.length + 1; }))));
        lines.push(fence, content, fence, "");
      });
    });
    lines.push("## 등록된 엔지니어링 기록", "");
    P.engineering.list(projectId).forEach(function (item) { lines.push("- " + item.kind + ": " + JSON.stringify(item.values)); });
    lines.push("", "## 보존 코드 버전", "");
    P.engineering.versions(projectId).forEach(function (item) { lines.push("- " + item.title + " · " + item.createdAt + " · 출처: " + (item.sourceKey || item.restoredFrom || "사용자 기록")); });
    lines.push("", "## 추가 확인 사항", "", "- CPU 모델·명령어 호환성·GX Works 컴파일·현장 안전 조건은 별도 확인이 필요합니다.");
    P.engineering.diagnostics(projectId).forEach(function (message) { lines.push("- " + message); });
    return lines.join("\n");
  }
  async function exportProject(projectId) {
    var project = P.data.projects().find(function (item) { return item.id === projectId; });
    requireValue(project, "프로젝트를 찾지 못했습니다.");
    var records = await P.storage.filesFor(projectId), files = [], total = 0;
    for (var record of records) {
      total += record.blob.size;
      requireValue(total <= 50 * 1024 * 1024, "이미지를 포함한 백업은 총 50MB 이하로 나누어 주세요.");
      var bytes = new Uint8Array(await record.blob.arrayBuffer()), binary = "";
      for (var i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      files.push({ id: record.id, projectId: projectId, name: record.name, type: record.blob.type, base64: root.btoa(binary), createdAt: record.createdAt });
    }
    return validate({ format: "panellab-project", schema: 1, exportedAt: new Date().toISOString(),
      project: clone(project), results: clone(P.data.resultsFor(projectId)), conversations: clone(P.conversations.forProject(projectId)),
      engineering: P.engineering.snapshot(projectId), files: files });
  }
  function prepareRestore(pack) {
    validate(pack); pack = clone(pack);
    var projectId = root.crypto.randomUUID(), mapping = new Map(), fileMapping = new Map(), conversations = new Map();
    pack.project.id = projectId; pack.project.name = (pack.project.name.slice(0, 170) + " (복원)");
    pack.conversations.forEach(function (item) { var old = item.id; item.id = root.crypto.randomUUID(); conversations.set(old, item.id); item.projectId = projectId; });
    pack.results.forEach(function (item) {
      var old = item.key; item.key = projectId + ":" + old; mapping.set(old, item.key);
      item.projectId = projectId; item.conversationId = conversations.get(item.conversationId) || null;
    });
    var files = pack.files.map(function (item) {
      var id = root.crypto.randomUUID(); fileMapping.set(item.id, id);
      var binary;
      try { binary = root.atob(item.base64); } catch (error) { throw new Error("첨부의 Base64를 읽지 못했습니다."); }
      var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
      requireValue(bytes.length > 0 && bytes.length <= 15 * 1024 * 1024, "첨부 크기를 확인하세요.");
      var png = [137, 80, 78, 71, 13, 10, 26, 10].every(function (byte, index) { return bytes[index] === byte; });
      var jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      requireValue(item.type === "image/png" ? png : jpg, "첨부의 실제 이미지 형식이 일치하지 않습니다.");
      return { id: id, projectId: projectId, name: item.name, blob: new Blob([bytes], { type: item.type }), createdAt: item.createdAt, state: "local-only" };
    });
    if (pack.project.workingCopy) pack.project.workingCopy.sourceKey = mapping.get(pack.project.workingCopy.sourceKey) || "";
    var requestIds = new Map();
    (pack.project.requests || []).forEach(function (item) { var old = item.id; item.id = root.crypto.randomUUID(); requestIds.set(old, item.id); item.conversationId = conversations.get(item.conversationId) || null; });
    var ids = new Map();
    pack.engineering.records.concat(pack.engineering.versions, pack.engineering.stages).forEach(function (item) {
      var old = item.id; item.id = root.crypto.randomUUID(); ids.set(old, item.id); item.projectId = projectId;
      if (item.sourceKey) item.sourceKey = mapping.get(item.sourceKey) || "";
      if (item.values) {
        if (item.values.sourceKey) item.values.sourceKey = mapping.get(item.values.sourceKey) || "";
        if (item.values.fileId) item.values.fileId = fileMapping.get(item.values.fileId) || "";
      }
    });
    pack.engineering.versions.forEach(function (item) { item.restoredFrom = ids.get(item.restoredFrom) || ""; });
    pack.engineering.stages.forEach(function (item) { if (typeof item.requestId === "string") item.requestId = requestIds.get(item.requestId) || ""; });
    return { pack: pack, files: files };
  }
  async function restore(pack) {
    var prepared = prepareRestore(pack), copy = prepared.pack, old = keys.map(function (key) { return root.localStorage.getItem(key); });
    var values = old.map(function (value, i) {
      var parsed = value === null ? i === 3 ? { schema: 1, records: [], versions: [], stages: [] } : [] : JSON.parse(value);
      if (i < 3) requireValue(Array.isArray(parsed), "기존 저장소가 올바르지 않아 복원을 중단했습니다.");
      else P.engineering.validate(parsed);
      return parsed;
    });
    values[0].push(copy.project); values[1] = values[1].concat(copy.results); values[2] = values[2].concat(copy.conversations);
    ["records", "versions", "stages"].forEach(function (key) { values[3][key] = values[3][key].concat(copy.engineering[key]); });
    if (prepared.files.length) await P.storage.addFiles(prepared.files);
    var written = 0;
    try {
      requireValue(keys.every(function (key, i) { return root.localStorage.getItem(key) === old[i]; }),
        "복원 중 다른 작업이 저장소를 변경했습니다. 다시 시도하세요.");
      keys.forEach(function (key, i) { root.localStorage.setItem(key, JSON.stringify(values[i])); written++; });
    } catch (error) {
      var rollbackError;
      for (var i = written - 1; i >= 0; i--) {
        try { if (old[i] === null) root.localStorage.removeItem(keys[i]); else root.localStorage.setItem(keys[i], old[i]); }
        catch (failure) { rollbackError = failure; }
      }
      try { if (prepared.files.length) await P.storage.rollbackFiles(prepared.files); }
      catch (failure) { rollbackError = failure; }
      throw new Error(rollbackError ? "복원과 되돌리기에 실패했습니다. 백업을 보존하고 저장소를 확인하세요." : "복원 저장에 실패했습니다. 기존 자료는 유지했습니다.");
    }
    return copy.project.id;
  }
  P.reports = { markdown: markdown, exportProject: exportProject, validate: validate, prepareRestore: prepareRestore, restore: restore };
})(window);
