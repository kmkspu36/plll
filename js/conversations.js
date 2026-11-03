(function (root) {
  "use strict";
  var P = root.PanelLab, key = "panellab.conversations.v1", activeId = null, records = [];
  function notify(message) {
    root.dispatchEvent(new CustomEvent("panellab:error", { detail: message }));
  }
  try {
    records = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(records) || records.some(function (c) {
      return !c || typeof c.id !== "string" || typeof c.projectId !== "string" || !Array.isArray(c.activities);
    })) throw new Error("Invalid conversations");
  } catch (error) {
    records = [];
    setTimeout(function () { notify("저장된 대화 기록을 읽지 못했습니다. 저장소를 확인해 주세요."); }, 0);
  }
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(records)); }
    catch (error) { notify("대화를 저장하지 못했습니다. 저장 공간을 확인하고 원본을 내보내 주세요."); }
    root.dispatchEvent(new CustomEvent("panellab:conversations"));
  }
  function active() { return records.find(function (c) { return c.id === activeId; }) || null; }
  function create(projectId) {
    var c = {
      id: root.crypto.randomUUID(), projectId: projectId, title: "새 대화",
      createdAt: new Date().toISOString(), activities: []
    };
    records.push(c); activeId = c.id; persist(); return c;
  }
  function record(conversation, activity, direction) {
    if (!conversation || !activity || activity.type !== "message") return;
    var copy;
    try { copy = JSON.parse(JSON.stringify(activity)); }
    catch (error) { notify("메시지 원본을 보존하지 못했습니다."); return; }
    var id = activity.id ? direction + ":" + activity.id : null;
    var existing = id && conversation.activities.find(function (a) { return a.key === id; });
    if (existing) { existing.activity = copy; persist(); return; }
    conversation.activities.push({
      key: id || root.crypto.randomUUID(), direction: direction, activity: copy, time: new Date().toISOString()
    });
    if (direction === "outgoing" && conversation.title === "새 대화" && activity.text) {
      conversation.title = activity.text.slice(0, 40);
    }
    persist();
  }
  P.conversations = {
    create: create, active: active, record: record,
    forProject: function (id) { return records.filter(function (c) { return c.projectId === id; }).slice().reverse(); },
    get: function (id) { return records.find(function (c) { return c.id === id; }); }
  };
})(window);
