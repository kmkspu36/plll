(function (root) {
  "use strict";
  var P = root.PanelLab = root.PanelLab || {};
  var directLine, subscription, controller, store, generation = 0, ready = false;
  var status = document.getElementById("status");
  var statusText = document.getElementById("statusText");
  var retry = document.getElementById("retryConnect");
  var labels = ["연결 준비", "연결 중", "연결됨", "토큰 만료", "연결 실패", "연결 종료"];

  function show(message, state, retryable) {
    ready = state === 2;
    document.getElementById("webchat").inert = !ready;
    status.hidden = ready;
    statusText.textContent = message;
    document.getElementById("connectionLabel").textContent = labels[state] || "연결 확인 중";
    document.querySelector(".connection-chip").classList.toggle("offline", !ready);
    retry.hidden = !retryable;
    retry.disabled = false;
    P.connected = ready;
    root.dispatchEvent(new CustomEvent("panellab:connection"));
  }

  function stop() {
    generation++;
    ready = false;
    P.connected = false;
    if (controller) controller.abort();
    if (subscription) subscription.unsubscribe();
    if (directLine) directLine.end();
    controller = subscription = directLine = store = null;
  }

  async function connect() {
    stop();
    var current = generation;
    show("기존 통합운영 에이전트에 연결하는 중입니다...", 1, false);
    if (!root.WebChat || typeof root.WebChat.createStore !== "function" ||
        typeof root.WebChat.createDirectLine !== "function" || typeof root.WebChat.renderWebChat !== "function") {
      show("채팅 구성 요소를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.", 4, true);
      return;
    }
    controller = new AbortController();
    var requestController = controller;
    var timeout = setTimeout(function () { requestController.abort(); }, 20000);
    try {
      var response = await fetch("/api/chatToken", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: requestController.signal
      });
      if (current !== generation) return;
      if (!response.ok) {
        var messages = {
          401: "서버 로그인이 필요합니다. 배포 사이트의 로그인 상태를 확인해 주세요.",
          403: "이 사이트에서 채팅 연결을 요청할 수 없습니다.",
          404: "토큰 서버가 배포되지 않았습니다. 서버 설정 안내를 확인해 주세요.",
          429: "연결 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
          503: "토큰 서버의 인증 환경변수 또는 배포 설정이 필요합니다."
        };
        show(messages[response.status] || "연결 요청 실패 (HTTP " + response.status + "). 다시 시도해 주세요.", 4, true);
        return;
      }
      var data = await response.json();
      if (current !== generation) return;
      if (!data || typeof data.token !== "string" || !data.token.trim()) {
        show("서버가 유효한 연결 토큰을 반환하지 않았습니다.", 4, true);
        return;
      }
      var context = P.conversations.active() || P.conversations.create(P.data.active().id);
      store = P.createStore(context);
      directLine = root.WebChat.createDirectLine({ token: data.token });
      var line = directLine, greeted = false;
      root.WebChat.renderWebChat({
        directLine: line, store: store, locale: "ko-KR",
        styleOptions: {
          backgroundColor: "#111827", bubbleBackground: "#1d293b", bubbleTextColor: "#e5edf8",
          bubbleFromUserBackground: "#234c83", bubbleFromUserTextColor: "#ffffff",
          sendBoxBackground: "#172235", sendBoxTextColor: "#e5edf8",
          sendBoxButtonColor: "#9cb3d3", suggestedActionBackgroundColor: "#1d293b",
          suggestedActionTextColor: "#e5edf8", hideUploadButton: true,
          primaryFont: '"Segoe UI", "Malgun Gothic", sans-serif'
        }
      }, document.getElementById("webchat"));
      subscription = line.connectionStatus$.subscribe(function (state) {
        if (current !== generation) return;
        var descriptions = [
          "연결을 준비하고 있습니다.", "연결 중입니다. 잠시 기다려 주세요.", "",
          "연결 토큰이 만료되었습니다. 다시 연결하면 새 대화가 시작됩니다.",
          "에이전트 연결에 실패했습니다. 다시 연결하면 새 대화가 시작됩니다.",
          "연결이 종료되었습니다. 다시 연결하면 새 대화가 시작됩니다."
        ];
        show(descriptions[state] || "", state, state >= 3);
        if (state === 2 && !greeted) {
          greeted = true;
          line.postActivity({ type: "event", name: "startConversation", from: { id: "user" } }).subscribe({
            error: function () {
              if (current !== generation) return;
              status.hidden = false;
              statusText.textContent = "첫 인사 요청에 실패했습니다. 메시지를 직접 입력해 주세요.";
            }
          });
        }
      });
    } catch (error) {
      if (current !== generation) return;
      show(error.name === "AbortError" ? "연결 요청 시간이 초과되었습니다. 다시 시도해 주세요." :
        "서버 응답을 처리하지 못했습니다. 네트워크와 서버 설정을 확인해 주세요.", 4, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  retry.addEventListener("click", function () {
    if (P.conversations.active()) P.conversations.create(P.data.active().id);
    connect();
  });
  P.connect = connect;
  P.disconnect = stop;
  P.sendRequest = function (text) {
    if (!ready || !store) return false;
    store.dispatch({ type: "WEB_CHAT/SEND_MESSAGE", payload: { text: text } });
    return true;
  };
})(window);
