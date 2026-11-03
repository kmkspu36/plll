(function (root) {
  "use strict";
  var P = root.PanelLab, D = P.data;
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function date(value) {
    var parsed = new Date(value);
    return isNaN(parsed) ? "기록 없음" : parsed.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function init(actions) {
    function render() {
      var project = D.active(), projects = D.projects(), results = D.resultsFor(project.id);
      var metrics = document.getElementById("dashboardMetrics");
      metrics.textContent = "";
      [
        ["전체 프로젝트", projects.length, "이 브라우저의 프로젝트"],
        ["진행 중", projects.filter(function (p) { return p.status === "active"; }).length, "사용자가 지정한 상태"],
        ["완료", projects.filter(function (p) { return p.status === "complete"; }).length, "AI 검증 완료를 뜻하지 않음"],
        ["현재 프로젝트 결과", results.length, "원본을 보존한 결과"]
      ].forEach(function (item, index) {
        var card = node("div", "metric-card");
        card.appendChild(node("span", "metric-symbol", ["▦", "▷", "✓", "▤"][index])).setAttribute("aria-hidden", "true");
        var content = node("div"); content.appendChild(node("span", "metric-title", item[0]));
        content.appendChild(node("strong", "", String(item[1]))); content.appendChild(node("small", "", item[2]));
        card.appendChild(content); metrics.appendChild(card);
      });
      var list = document.getElementById("dashboardProjects"); list.textContent = "";
      projects.sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); }).slice(0, 5).forEach(function (item) {
        var button = node("button", "project-link" + (item.id === project.id ? " selected" : ""));
        button.type = "button";
        var text = node("span"); text.appendChild(node("strong", "", item.name));
        text.appendChild(node("small", "", (item.software || "소프트웨어 미정") + " · " + (item.cpu || "CPU 미정") + " · " + date(item.updatedAt || item.createdAt)));
        button.appendChild(node("span", "project-folder", "▣")).setAttribute("aria-hidden", "true");
        button.appendChild(text);
        button.appendChild(node("span", "project-status", D.statusLabels[item.status] || "미분류"));
        button.setAttribute("aria-pressed", String(item.id === project.id));
        button.onclick = function () { D.setActive(item.id); };
        list.appendChild(button);
      });
      var workflow = document.getElementById("dashboardWorkflow"); workflow.textContent = "";
      Object.keys(D.taskLabels).forEach(function (task, index) {
        var requests = (Array.isArray(project.requests) ? project.requests : []).filter(function (request) { return request.task === task; });
        var matched = results.filter(function (result) { return result.task === task; });
        var latestRequest = requests.length ? requests[requests.length - 1].requestedAt : "";
        var latestResult = matched.reduce(function (latest, result) { return result.classifiedAt > latest ? result.classifiedAt : latest; }, "");
        var needsReview = !!latestResult && latestResult >= latestRequest;
        var item = node("li", needsReview ? "has-result" : requests.length ? "requested" : "");
        item.appendChild(node("span", "workflow-number", String(index + 1)));
        var text = node("div"); text.appendChild(node("strong", "", D.taskLabels[task]));
        text.appendChild(node("small", "", needsReview ? "실제 결과 " + matched.length + "개 · 사용자 확인 필요" :
          requests.length ? "요청 기록 " + requests.length + "건 · 처리 상태 미확인" : "대기 · 단계 결과가 아직 연결되지 않음"));
        item.appendChild(text);
        var button = node("button", "text-btn", needsReview ? "결과 보기" : "요청");
        button.type = "button"; button.setAttribute("aria-label", D.taskLabels[task] + (needsReview ? " 결과 보기" : " 요청"));
        button.onclick = function () { if (needsReview) actions.results(task); else actions.request(task); };
        item.appendChild(button); workflow.appendChild(item);
      });
      var history = D.historyFor(project.id).slice().reverse().slice(0, 6);
      var historyList = document.getElementById("dashboardHistoryList"); historyList.textContent = "";
      if (!history.length) historyList.appendChild(node("p", "empty", "아직 작업 이력이 없습니다. 기존 에이전트와 대화를 시작하세요."));
      history.forEach(function (entry) {
        var item = node("div", "history-entry");
        item.appendChild(node("span", "history-marker", entry.kind === "user" ? "↗" : "↙")).setAttribute("aria-hidden", "true");
        var content = node("div"); content.appendChild(node("strong", "", entry.text));
        content.appendChild(node("small", "", (entry.kind === "user" ? "사용자 요청" : "수신 결과") + " · " + date(entry.time)));
        item.appendChild(content); historyList.appendChild(item);
      });
      document.getElementById("headerProject").textContent = project.name + " / " + project.software + " / " + (project.cpu || "CPU 미정");
    }
    function connection() {
      document.getElementById("agentConnection").textContent = P.connected ? "연결됨" : "연결되지 않음";
      document.getElementById("agentDot").classList.toggle("online", !!P.connected);
      document.getElementById("agentConnection").title = P.connectionMessage || "연결 확인 중";
    }
    document.getElementById("dashboardChat").onclick = actions.chat;
    document.getElementById("dashboardProject").onclick = function () { actions.project(false); };
    document.getElementById("dashboardNew").onclick = function () { actions.project(true); };
    document.getElementById("dashboardAttach").onclick = function () { actions.chat(); P.attachments.open(); };
    document.getElementById("dashboardHistory").onclick = actions.history;
    document.getElementById("mobileDashboard").onclick = actions.home;
    document.getElementById("headerHelp").onclick = actions.settings;
    D.onChange(render);
    root.addEventListener("panellab:conversations", render);
    root.addEventListener("panellab:connection", connection);
    render(); connection();
  }
  P.workspace = { init: init };
})(window);
