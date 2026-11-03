(function (root) {
  "use strict";
  var site = "https://superb-fudge-1fb499.netlify.app";
  var origin = root.location.origin;
  if (origin !== "https://kmkspu36.github.io" && origin !== site) return;
  if (origin === site && /(?:^#|&)(?:invite_token|confirmation_token|recovery_token|access_token)=/.test(root.location.hash)) {
    root.location.replace("/auth.html" + root.location.hash);
    return;
  }
  var P = root.PanelLab = root.PanelLab || {};
  P.requestHostedToken = function (signal) {
    return new Promise(function (resolve, reject) {
      function failure(message) { var error = new Error(message); error.name = "HostedLoginError"; return error; }
      if (!root.navigator.userActivation || !root.navigator.userActivation.isActive) {
        reject(failure("채팅 연결에는 초대받은 계정의 로그인이 필요합니다. 다시 연결 버튼을 눌러 로그인 창을 여세요."));
        return;
      }
      var bytes = new Uint8Array(32);
      root.crypto.getRandomValues(bytes);
      var state = Array.from(bytes, function (n) { return n.toString(16).padStart(2, "0"); }).join("");
      var popup = root.open(site + "/auth.html?parent=" + encodeURIComponent(origin) + "&state=" + state,
        "_blank", "popup,width=560,height=760");
      if (!popup) { reject(failure("로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 연결하세요.")); return; }
      var interval;
      function cleanup() {
        root.removeEventListener("message", receive);
        signal.removeEventListener("abort", abort);
        clearInterval(interval);
      }
      function abort() {
        cleanup(); popup.close();
        reject(failure("로그인 연결 시간이 만료되었거나 취소되었습니다. 다시 연결하세요."));
      }
      function receive(event) {
        if (event.origin !== site || event.source !== popup || !event.data ||
            event.data.type !== "panellab:token" || event.data.state !== state) return;
        var data = event.data.data;
        if (!data || typeof data.token !== "string" || !data.token.trim()) return;
        cleanup(); popup.close();
        resolve({ ok: true, json: async function () { return data; } });
      }
      root.addEventListener("message", receive);
      signal.addEventListener("abort", abort, { once: true });
      interval = setInterval(function () {
        if (popup.closed) { cleanup(); reject(failure("로그인 창이 닫혔습니다. 다시 연결하세요.")); }
      }, 500);
      if (signal.aborted) abort();
    });
  };
})(window);
