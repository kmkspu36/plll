(function (root) {
  "use strict";
  var P = root.PanelLab = root.PanelLab || {};
  var directLine, subscription, controller, store, generation = 0, ready = false, connectTimeout;
  var status = document.getElementById("status");
  var statusText = document.getElementById("statusText");
  var retry = document.getElementById("retryConnect");
  var labels = ["연결 준비", "연결 중", "연결됨", "토큰 만료", "연결 실패", "연결 종료"];

  function show(message, state, retryable, phase) {
    ready = state === 2;
    var chat = document.getElementById("webchat");
    var loading = state === 0 || state === 1;
    document.getElementById("app").dataset.connection = ready ? "ready" : loading ? "loading" : "error";
    chat.inert = !ready;
    chat.hidden = !directLine;
    document.getElementById("connectionScreen").hidden = ready;
    document.getElementById("offlineComposer").hidden = !!directLine;
    document.getElementById("connectionTitle").textContent = ready ? "에이전트 연결 완료" :
      loading ? (phase || "기존 에이전트에 연결하고 있습니다") : "채팅 연결을 완료하지 못했습니다";
    document.getElementById("connectionDetail").textContent = message;
    document.getElementById("retryConnectionScreen").hidden = !retryable;
    if (ready || state >= 3) clearTimeout(connectTimeout);
    status.hidden = ready;
    statusText.textContent = message;
    document.getElementById("connectionLabel").textContent = labels[state] || "연결 확인 중";
    document.querySelector(".connection-chip").classList.toggle("offline", !ready);
    retry.hidden = !retryable;
    retry.disabled = false;
    P.connected = ready;
    P.connectionMessage = message;
    if (!ready) {
      document.getElementById("sendStatus").textContent = loading ? "연결 중 · 아직 전송할 수 없습니다." : "연결되지 않음 · 전송 불가";
      document.getElementById("sendStatus").dataset.state = "idle";
    }
    root.dispatchEvent(new CustomEvent("panellab:connection"));
  }

  function stop() {
    if (P.presentation) P.presentation.stop();
    generation++;
    ready = false;
    P.connected = false;
    P.uploadCapabilities = null;
    clearTimeout(connectTimeout);
    if (controller) controller.abort();
    if (subscription) subscription.unsubscribe();
    if (directLine) directLine.end();
    controller = subscription = directLine = store = null;
  }

  async function connect() {
    stop();
    var current = generation;
    show("서버 측 설정과 단기 토큰 발급을 확인하고 있습니다.", 1, false, "토큰 서버에 연결하고 있습니다");
    if (!root.WebChat || typeof root.WebChat.createStore !== "function" ||
        typeof root.WebChat.createDirectLine !== "function" || typeof root.WebChat.renderWebChat !== "function") {
      show("채팅 구성 요소를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.", 4, true);
      return;
    }
    controller = new AbortController();
    var requestController = controller;
    var timeout = setTimeout(function () { requestController.abort(); }, P.requestHostedToken ? 180000 : 20000);
    try {
      if (!P.requestHostedToken && root.location && root.location.hostname.endsWith(".github.io")) {
        show("현재 호스팅은 GitHub Pages입니다. Pages는 서버 토큰 중계를 실행할 수 없습니다. 기존 Broker를 안전하게 연결할 서버 배포가 필요합니다.", 4, false);
        return;
      }
      var response = P.requestHostedToken ? await P.requestHostedToken(requestController.signal) : await fetch("/api/chatToken", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: requestController.signal
      });
      if (current !== generation) return;
      if (!response.ok) {
        var failure = {};
        try { failure = await response.json(); } catch (error) {
          if (current !== generation) return;
        }
        if (current !== generation) return;
        var codes = {
          SERVER_CONFIG_MISSING: "토큰 서버 설정이 누락되었습니다.",
          SERVER_CONFIG_INVALID: "토큰 서버의 Broker URL·허용 Origin·Broker Origin 형식을 확인해 주세요.",
          LOGIN_REQUIRED: "호스팅 로그인이 필요합니다. 로컬 실행은 서버의 개발 모드 설정을 확인해 주세요.",
          ORIGIN_DENIED: "요청 Origin과 서버의 허용 Origin이 다릅니다.",
          BROKER_REJECTED: "기존 Broker가 토큰 요청을 거부했습니다.",
          BROKER_INVALID_JSON: "기존 Broker가 JSON이 아닌 응답을 반환했습니다.",
          BROKER_TOKEN_MISSING: "기존 Broker 응답에 유효한 token 필드가 없습니다.",
          BROKER_TIMEOUT: "기존 Broker의 응답 시간이 초과되었습니다.",
          BROKER_NETWORK_ERROR: "토큰 서버에서 기존 Broker로 연결하지 못했습니다. DNS·TLS·네트워크 설정을 확인해 주세요.",
          SERVER_INTERNAL_ERROR: "토큰 서버 내부 오류가 발생했습니다. 운영 로그를 확인해 주세요."
        };
        var knownKeys = ["PANEL_BROKER_URL", "PANEL_BROKER_SEALED", "PANEL_ALLOWED_ORIGIN"];
        var missing = Array.isArray(failure.missing) ? failure.missing.filter(function (name) { return knownKeys.indexOf(name) >= 0; }) : [];
        var detail = failure.code === "SERVER_CONFIG_MISSING" && missing.length ? " 누락 항목: " + missing.join(", ") + "." : "";
        if (failure.code === "BROKER_REJECTED" && Number.isInteger(failure.upstreamStatus)) {
          detail = " Broker HTTP " + failure.upstreamStatus + ". 인증값은 서버에서 확인해야 합니다.";
        }
        var messages = {
          401: "서버 로그인이 필요합니다. 배포 사이트의 로그인 상태를 확인해 주세요.",
          403: "이 사이트에서 채팅 연결을 요청할 수 없습니다.",
          404: "토큰 서버가 배포되지 않았습니다. 서버 설정 안내를 확인해 주세요.",
          429: "연결 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
          503: "토큰 서버의 인증 환경변수 또는 배포 설정이 필요합니다."
        };
        show((codes[failure.code] || messages[response.status] || "연결 요청 실패 (HTTP " + response.status + ").") + detail, 4, true);
        return;
      }
      var data = await response.json();
      if (current !== generation) return;
      if (!data || typeof data.token !== "string" || !data.token.trim()) {
        show("서버가 유효한 연결 토큰을 반환하지 않았습니다.", 4, true);
        return;
      }
      var context = P.conversations.active() || P.conversations.create(P.data.active().id);
      var uploads = data.uploads;
      P.uploadCapabilities = uploads && uploads.verified === true &&
        Number.isInteger(uploads.maxFiles) && uploads.maxFiles >= 1 && uploads.maxFiles <= 5 &&
        Number.isInteger(uploads.maxBytes) && uploads.maxBytes > 0 && uploads.maxBytes <= 15 * 1024 * 1024 ?
        { verified: true, maxFiles: uploads.maxFiles, maxBytes: uploads.maxBytes } : null;
      store = P.createStore(context);
      directLine = root.WebChat.createDirectLine({ token: data.token });
      var line = directLine, greeted = false;
      connectTimeout = setTimeout(function () {
        if (current === generation && !ready) show("토큰 발급 후 Direct Line 연결 시간이 초과되었습니다. 네트워크와 채널 설정을 확인해 주세요.", 4, true);
      }, 30000);
      root.WebChat.renderWebChat({
        directLine: line, store: store, locale: "ko-KR",
        styleOptions: {
          backgroundColor: "#ffffff", bubbleBackground: "#f0f4fa", bubbleTextColor: "#1c3559",
          bubbleFromUserBackground: "#dbeaff", bubbleFromUserTextColor: "#17457d",
          sendBoxBackground: "#ffffff", sendBoxTextColor: "#1a365f",
          sendBoxButtonColor: "#1769ea", suggestedActionBackgroundColor: "#edf4ff",
          suggestedActionTextColor: "#17457d", hideUploadButton: true,
          fontSizeSmall: "12px", bubbleMaxWidth: 840,
          bubbleBorderRadius: 12, bubbleFromUserBorderRadius: 12,
          bubbleNubSize: 0, bubbleFromUserNubSize: 0,
          paddingRegular: 14,
          sendBoxHeight: 60, sendBoxBorderTop: "1px solid #dce4f1",
          sendBoxPlaceholderColor: "#647492",
          primaryFont: '"Segoe UI", "Malgun Gothic", sans-serif'
        }
      }, document.getElementById("webchat"));
      if (P.presentation) P.presentation.observe(document.getElementById("webchat"));
      subscription = line.connectionStatus$.subscribe(function (state) {
        if (current !== generation) return;
        var descriptions = [
          "연결을 준비하고 있습니다.", "연결 중입니다. 잠시 기다려 주세요.", "",
          "연결 토큰이 만료되었습니다. 다시 연결하면 새 대화가 시작됩니다.",
          "에이전트 연결에 실패했습니다. 다시 연결하면 새 대화가 시작됩니다.",
          "연결이 종료되었습니다. 다시 연결하면 새 대화가 시작됩니다."
        ];
        show(descriptions[state] || "", state, state >= 3);
        if (state === 2) {
          document.getElementById("sendStatus").textContent = "연결됨 · 기존 에이전트에 메시지를 입력하세요.";
          document.getElementById("sendStatus").dataset.state = "idle";
        }
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
      show(error.name === "HostedLoginError" ? error.message : error.name === "AbortError" ? "연결 요청 시간이 초과되었습니다. 다시 시도해 주세요." :
        "서버 응답을 처리하지 못했습니다. 네트워크와 서버 설정을 확인해 주세요.", 4, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  function retryConnection() {
    var context = P.conversations.active();
    if (context && context.activities && context.activities.length &&
        !root.confirm("새 서버 대화로 다시 연결합니다. 현재 대화는 읽기 전용 기록으로 보존됩니다. 계속할까요?")) return;
    if (P.conversations.active()) P.conversations.create(P.data.active().id);
    connect();
  }
  retry.addEventListener("click", retryConnection);
  document.getElementById("retryConnectionScreen").addEventListener("click", retryConnection);
  P.connect = connect;
  P.disconnect = stop;
  P.sendRequest = function (text) {
    if (!ready || !store) return false;
    store.dispatch({ type: "WEB_CHAT/SEND_MESSAGE", payload: { text: text } });
    return true;
  };
  P.sendAttachments = function (files, text) {
    var cap = P.uploadCapabilities;
    if (!ready || !store || !cap || !cap.verified || !Array.isArray(files) || !files.length ||
        files.length > cap.maxFiles || files.some(function (file) {
          return !(file instanceof File) || file.size <= 0 || file.size > cap.maxBytes ||
            ["image/png", "image/jpeg"].indexOf(file.type) < 0;
        })) return false;
    store.dispatch({
      type: "WEB_CHAT/SEND_MESSAGE",
      payload: { text: text, attachments: files.map(function (file) { return { blob: file }; }) }
    });
    return true;
  };
})(window);
