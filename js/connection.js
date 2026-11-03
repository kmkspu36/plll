/* Existing Direct Line connection logic, preserved. Only change: `store` is passed to renderWebChat. */
(function (root) {
  "use strict";
  const BROKER_URL = "https://dl-broker-juwon-4jt3z.azurewebsites.net/api/directlineToken";
  const SEALED = "dMTArtlCf7wR5Rsofg1zKtHagB7d_2qs9YQi_Z2yRKUvOCiQDbsJ_xt96MzdEeWE0Wm-dzh_YxrlHfkyFE64C2f_rwi86-HM5qmSZP29BhOFWrjVA_XeJn6wCm6WSifRdQgmR_mv4L0bd_l2E0l3qtJyMPdCEwuzHfdSDEBcCTE8d1FbCBGKpcOSg_uWRmwmlDuGpC7H7WVp-ztPblzu34KQVsLo337qLXAQFRj3NfN6Q8AYutwQThWhfB6jwYsY01Zv6gQ5PpGx-wKRj0SpA1jC2M199CZkG8hQnMe_NUUEWo-lb-HM_zD5jbQERqb_h9g2sM230JtAo8LyyVYvI7D0lRUCTaLehzWNv-q0NwVsmEiue187WS9PbFU_zxJhE-f7VoPg_wYbEfaAAFuYTzxR2uLJ8qu5aG_1xpKgdn1uI7Y6LvitqpRUCwQjDlAqMp9SJZSq0fZON_JxgirrOUgYJh2abMkW88Ga4Q6hV4fG3-pmP9Wq3h7_G6-6TTrzeTvDu10tlCQ8mk80kOEkhk-QjL0hyKgZyRAxBD46e2VGfnu8vR0U3KY2VDXVM9_7xnVsiN4fswe3uNmUzEF4sbUsUne112HBu-yNSSTsZDCNsJE_Nu-DIzrQT7LeYKs2g3S4Hwd2QRLkJRYSrXM";
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const retryButton = document.getElementById("retryConnect");
  const connectionLabel = document.getElementById("connectionLabel");
  let connecting = false;
  let rendered = false;

  function showError(message, retryable) {
    status.hidden = false;
    statusText.textContent = message;
    retryButton.hidden = retryable === false;
    retryButton.disabled = false;
    connectionLabel.textContent = "연결되지 않음";
    document.querySelector(".connection-chip").classList.add("offline");
  }

  async function connect() {
    if (connecting || rendered) return;
    connecting = true;
    retryButton.disabled = true;
    status.hidden = false;
    statusText.textContent = "채팅에 연결하는 중입니다...";
    if (!window.WebChat ||
        typeof WebChat.createDirectLine !== "function" ||
        typeof WebChat.renderWebChat !== "function") {
      showError("채팅 구성 요소를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.");
      connecting = false;
      return;
    }

    let response;
    try {
      // Keep this a simple CORS request; the broker may not support preflight.
      response = await fetch(BROKER_URL, {
        method: "POST",
        body: JSON.stringify({ sealed: SEALED })
      });
    } catch {
      showError("서버에 연결하지 못했습니다. 네트워크와 배포 주소를 확인해 주세요.");
      connecting = false;
      return;
    }
    if (!response.ok) {
      showError("서버가 연결 요청을 처리하지 못했습니다 (HTTP " + response.status + ").");
      connecting = false;
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      showError("서버 응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.");
      connecting = false;
      return;
    }
    if (!data || typeof data.token !== "string" || !data.token.trim()) {
      showError("서버에서 연결 토큰을 받지 못했습니다. 암호와 배포 주소를 확인해 주세요.");
      connecting = false;
      return;
    }

    try {
      const directLine = WebChat.createDirectLine({ token: data.token });
      status.hidden = true;
      connectionLabel.textContent = "에이전트 연결됨";
      document.querySelector(".connection-chip").classList.remove("offline");
      directLine.postActivity({
        type: "event", name: "startConversation", from: { id: "user" }
      }).subscribe({
        error: () => showError("첫 인사를 요청하지 못했습니다. 채팅창에 메시지를 입력해 주세요.", false)
      });
      const store = root.PanelLab.createStore();
      WebChat.renderWebChat({ directLine, locale: "ko-KR", store }, document.getElementById("webchat"));
      rendered = true;
    } catch {
      showError("채팅을 시작하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      connecting = false;
    }
  }

  retryButton.addEventListener("click", connect);
  root.PanelLab = root.PanelLab || {};
  root.PanelLab.connect = connect;
})(window);
