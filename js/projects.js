/* Project management + results store (localStorage). Chat history is NOT stored here. */
(function (root) {
  "use strict";
  var PKEY = "panellab.projects.v1", RKEY = "panellab.results.v1", AKEY = "panellab.activeProject.v1";
  var listeners = [];

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var projects = load(PKEY, []);
  var results = load(RKEY, []);
  var history = [];
  var activeId = load(AKEY, null);

  if (!projects.length) {
    projects.push({ id: uid(), name: "기본 프로젝트", vendor: "", software: "GX Works3", cpu: "", createdAt: new Date().toISOString() });
    save(PKEY, projects);
  }
  if (!projects.some(function (p) { return p.id === activeId; })) activeId = projects[0].id;

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
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
    if (!save(RKEY, results)) {
      results = results.slice(-50); save(RKEY, results);
    }
    emit();
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

  root.PanelLab = root.PanelLab || {};
  root.PanelLab.data = {
    projects: function () { return projects.slice(); }, active: active, setActive: setActive,
    addProject: addProject, updateProject: updateProject, addResult: addResult,
    resultsFor: resultsFor, addHistory: addHistory, historyFor: historyFor,
    clearResults: clearResults, onChange: onChange
  };
})(window);
