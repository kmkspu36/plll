/* Project management + results store (localStorage). Chat history is NOT stored here. */
(function (root) {
  "use strict";
  var PKEY = "panellab.projects.v1", RKEY = "panellab.results.v1", AKEY = "panellab.activeProject.v1";
  var listeners = [];
  var storageBlocked = false;
  function notify(message) {
    setTimeout(function () { root.dispatchEvent(new CustomEvent("panellab:error", { detail: message })); }, 0);
  }

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { storageBlocked = true; notify("저장된 프로젝트 또는 결과를 읽지 못했습니다. 기존 데이터 보호를 위해 저장을 중지했습니다."); return fallback; }
  }
  function save(key, value) {
    if (storageBlocked) { notify("저장소 복구가 필요합니다. 현재 작업을 파일로 저장해 주세요."); return false; }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { notify("브라우저 저장에 실패했습니다. 데이터는 현재 화면에만 있습니다. 파일로 저장해 주세요."); return false; }
  }
  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var projects = load(PKEY, []);
  var results = load(RKEY, []);
  var history = [];
  var activeId = load(AKEY, null);
  if (!Array.isArray(projects) || projects.some(function (p) { return !p || typeof p.id !== "string"; }) ||
      !Array.isArray(results) || results.some(function (r) { return !r || typeof r.projectId !== "string" || !r.data; })) {
    storageBlocked = true;
    projects = []; results = [];
    notify("저장 데이터 형식이 올바르지 않습니다. 기존 저장소를 덮어쓰지 않습니다.");
  }

  if (!projects.length) {
    projects.push({ id: uid(), name: "기본 프로젝트", vendor: "", software: "GX Works3", cpu: "", createdAt: new Date().toISOString() });
    save(PKEY, projects);
  }
  if (!projects.some(function (p) { return p.id === activeId; })) activeId = projects[0].id;

  function emit() { listeners.forEach(function (fn) { fn(); }); }
  function onChange(fn) { listeners.push(fn); }

  function addProject(p) {
    var proj = {
      id: uid(), name: (p.name || "").trim() || "새 프로젝트", vendor: (p.vendor || "").trim(),
      software: p.software === "GX Works2" ? "GX Works2" : "GX Works3", cpu: (p.cpu || "").trim(),
      createdAt: new Date().toISOString()
    };
    projects.push(proj); save(PKEY, projects); activeId = proj.id; save(AKEY, activeId); emit();
    return proj;
  }
  function updateProject(id, p) {
    var proj = projects.filter(function (x) { return x.id === id; })[0];
    if (!proj) return;
    ["name", "vendor", "software", "cpu"].forEach(function (k) { if (typeof p[k] === "string") proj[k] = p[k].trim(); });
    if (!proj.name) proj.name = "이름 없는 프로젝트";
    save(PKEY, projects); emit();
  }
  function setActive(id) {
    if (!projects.some(function (p) { return p.id === id; })) return;
    activeId = id; save(AKEY, id); emit();
  }
  function active() { return projects.filter(function (p) { return p.id === activeId; })[0]; }

  function addResult(messageId, idx, res, context, original) {
    if (!res || res.type === "text") return null;
    var key = (context ? context.id + ":" : "") + messageId + ":" + idx + ":" + res.type;
    if (results.some(function (r) { return r.key === key; })) return null;
    var rec = {
      key: key, messageId: messageId, receivedAt: new Date().toISOString(),
      projectId: context ? context.projectId : activeId, conversationId: context ? context.id : null,
      type: res.type, title: res.title, data: res.data, original: original || null, approval: "proposed"
    };
    results.push(rec);
    save(RKEY, results);
    emit();
    root.dispatchEvent(new CustomEvent("panellab:result", { detail: rec }));
    return rec;
  }
  function resultsFor(projectId) {
    return results.filter(function (r) { return r.projectId === projectId; });
  }
  function addHistory(entry, context) {
    history.push({ time: new Date().toISOString(), projectId: context ? context.projectId : activeId, kind: entry.kind, text: entry.text });
    emit();
  }
  function historyFor(projectId) {
    var fromResults = resultsFor(projectId).map(function (r) {
      return { time: r.receivedAt, kind: "result", text: r.title + " (" + r.type + ")" };
    });
    return history.filter(function (h) { return h.projectId === projectId; }).concat(fromResults)
      .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function clearResults(projectId) {
    results = results.filter(function (r) { return r.projectId !== projectId; });
    save(RKEY, results); emit();
  }
  function approve(key) {
    var rec = results.find(function (r) { return r.key === key && r.type === "correction"; });
    if (!rec) throw new Error("Correction not found");
    rec.approval = "approved";
    rec.approvedAt = new Date().toISOString();
    var project = projects.find(function (p) { return p.id === rec.projectId; });
    if (project) {
      project.workingCopy = { before: rec.data.before, code: rec.data.after, original: rec.original,
        sourceKey: rec.key, approvedAt: rec.approvedAt };
      save(PKEY, projects);
    }
    save(RKEY, results); emit();
  }

  root.PanelLab = root.PanelLab || {};
  root.PanelLab.data = {
    projects: function () { return projects.slice(); }, active: active, setActive: setActive,
    addProject: addProject, updateProject: updateProject, addResult: addResult,
    resultsFor: resultsFor, addHistory: addHistory, historyFor: historyFor,
    clearResults: clearResults, onChange: onChange, approve: approve
  };
})(window);
