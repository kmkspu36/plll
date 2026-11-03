(function () {
  "use strict";
  var status = document.getElementById("authStatus");
  var login = document.getElementById("authLogin");
  var connect = document.getElementById("authConnect");
  var logout = document.getElementById("authLogout");
  var params = new URLSearchParams(location.search);
  var parent = params.get("parent"), state = params.get("state");
  var allowed = ["https://kmkspu36.github.io", "https://superb-fudge-1fb499.netlify.app"];
  var canReturn = allowed.indexOf(parent) >= 0 && /^[a-f0-9]{64}$/.test(state || "") && !!window.opener;
  var widget = window.netlifyIdentity;
  if (!widget) {
    status.textContent = "로그인 구성 요소를 불러오지 못했습니다. 네트워크를 확인하고 새로고침하세요.";
    return;
  }
  function display(user) {
    login.disabled = false;
    login.hidden = !!user;
    logout.hidden = !user;
    connect.hidden = !user || !canReturn;
    status.textContent = user ? (canReturn ?
      "로그인되었습니다. 아래 버튼으로 기존 에이전트에 연결하세요." :
      "계정 준비가 완료되었습니다. PanelLab 작업실로 돌아가 다시 연결을 누르세요.") :
      "초대받은 계정으로 로그인하거나 초대를 수락하세요.";
  }
  widget.on("init", display);
  widget.on("login", function (user) { widget.close(); display(user); });
  widget.on("logout", function () { display(null); });
  widget.on("error", function () { status.textContent = "로그인 처리에 실패했습니다. 로그인 창의 안내를 확인하세요."; });
  login.addEventListener("click", function () { widget.open("login"); });
  logout.addEventListener("click", function () {
    widget.logout().catch(function () { status.textContent = "로그아웃에 실패했습니다. 다시 시도하세요."; });
  });
  connect.addEventListener("click", async function () {
    connect.disabled = true;
    status.textContent = "로그인을 검증하고 기존 Broker에 연결하고 있습니다.";
    try {
      var jwt = await widget.refresh();
      var response = await fetch("/.netlify/functions/chat-token", {
        method: "POST", cache: "no-store", credentials: "omit",
        headers: { Authorization: "Bearer " + jwt }, signal: AbortSignal.timeout(25000)
      });
      var data = await response.json();
      if (!response.ok) {
        var known = {
          LOGIN_REQUIRED: "로그인을 다시 진행하세요.",
          SERVER_CONFIG_MISSING: "Netlify 서버 환경변수가 아직 등록되지 않았습니다.",
          SERVER_CONFIG_INVALID: "Netlify 서버 환경변수 형식을 확인해야 합니다.",
          BROKER_REJECTED: "기존 Broker가 요청을 거부했습니다. 운영 인증값과 Broker Origin을 확인해야 합니다.",
          ORIGIN_DENIED: "서버의 허용 Origin 설정을 확인해야 합니다."
        };
        throw new Error(known[data.code] || "토큰 서버 연결에 실패했습니다 (HTTP " + response.status + ").");
      }
      if (!data || typeof data.token !== "string" || !data.token.trim()) throw new Error("유효한 연결 토큰이 없습니다.");
      if (!window.opener || window.opener.closed) throw new Error("작업실 창이 닫혔습니다. 작업실에서 다시 연결하세요.");
      window.opener.postMessage({ type: "panellab:token", state: state, data: data }, parent);
      status.textContent = "작업실에 연결 토큰을 전달했습니다. 작업실에서 실제 연결 상태를 확인하세요.";
      window.close();
    } catch (error) {
      status.textContent = error.name === "TimeoutError" ? "토큰 요청 시간이 초과되었습니다. 다시 시도하세요." : error.message;
    } finally { connect.disabled = false; }
  });
  widget.init();
})();
