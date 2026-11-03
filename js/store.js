/* Web Chat store middleware: observe activities, always forward via next(action). */
(function (root) {
  "use strict";
  var P = root.PanelLab = root.PanelLab || {};

  function messageIdOf(a) {
    if (a.id) return String(a.id);
    return "noid:" + (a.timestamp || "") + ":" + (a.text || "").length + ":" + (a.text || "").slice(0, 40);
  }

  function handleIncoming(activity, context) {
    if (!activity || typeof activity !== "object" || activity.type !== "message") return;
    if (activity.from && activity.from.role === "user") return;
    P.conversations.record(context, activity, "incoming");
    var id = messageIdOf(activity);
    P.analyzer.analyze(activity).forEach(function (res, idx) {
      P.data.addResult(id, idx, res, context, activity);
    });
  }

  function handleOutgoing(activity, context) {
    if (activity && activity.type === "message" &&
        ((typeof activity.text === "string" && activity.text) || (Array.isArray(activity.attachments) && activity.attachments.length))) {
      P.conversations.record(context, activity, "outgoing");
      P.data.addHistory({ kind: "user", text: activity.text ? activity.text.slice(0, 200) : "이미지 첨부 요청" }, context);
    }
  }

  P.createStore = function (context) {
    var pending = new Map(), responseVersion = 0;
    function sendState(message, state) {
      root.dispatchEvent(new CustomEvent("panellab:send", {
        detail: { message: message, state: state, conversationId: context.id }
      }));
    }
    return WebChat.createStore({}, function () {
      return function (next) {
        return function (action) {
          if (action && action.type === "WEB_CHAT/SEND_MESSAGE" && action.payload &&
              Array.isArray(action.payload.attachments) && action.payload.attachments.length) {
            var cap = P.uploadCapabilities;
            if (!P.connected || !cap || !cap.verified || action.payload.attachments.length > cap.maxFiles ||
                action.payload.attachments.some(function (attachment) {
                  return !attachment.blob || attachment.blob.size <= 0 || attachment.blob.size > cap.maxBytes ||
                    ["image/png", "image/jpeg"].indexOf(attachment.blob.type) < 0;
                })) {
              root.dispatchEvent(new CustomEvent("panellab:error", { detail: "이미지 전송이 차단되었습니다. 기존 에이전트의 업로드 검증과 첨부 형식·크기 제한을 확인하세요." }));
              return action;
            }
          }
          try {
            if (action && action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
              handleIncoming(action.payload && action.payload.activity, context);
            } else if (action && action.type === "DIRECT_LINE/POST_ACTIVITY") {
              handleOutgoing(action.payload && action.payload.activity, context);
            }
          } catch (e) {
            if (window.console) console.warn("PanelLab observer error", e);
            root.dispatchEvent(new CustomEvent("panellab:error", { detail: "응답의 보조 표시 또는 저장에 실패했습니다. 채팅 원문을 확인해 주세요." }));
          }
          var activity = action && action.payload && action.payload.activity;
          var clientId = action && action.meta && action.meta.clientActivityID;
          if (action && action.type === "DIRECT_LINE/POST_ACTIVITY_PENDING" && activity && activity.type === "message") {
            pending.set(clientId, responseVersion);
            sendState("메시지 전송 중", "sending");
          } else if (action && action.type === "DIRECT_LINE/POST_ACTIVITY_FULFILLED" && activity && activity.type === "message") {
            var version = pending.get(clientId);
            pending.delete(clientId);
            sendState(version !== undefined && version !== responseVersion ? "에이전트 응답 수신" : "메시지 전송됨 · 에이전트 응답 대기",
              version !== undefined && version !== responseVersion ? "received" : "waiting");
          } else if (action && action.type === "DIRECT_LINE/POST_ACTIVITY_REJECTED" && pending.has(clientId)) {
            pending.delete(clientId);
            sendState("메시지 전송 실패 · 채팅에서 재시도해 주세요.", "failed");
          } else if (action && action.type === "DIRECT_LINE/POST_ACTIVITY_IMPEDED" && pending.has(clientId)) {
            sendState("메시지 전송이 지연되고 있습니다. 채팅의 전송 상태를 확인해 주세요.", "sending");
          } else if (action && action.type === "DIRECT_LINE/INCOMING_ACTIVITY" && activity &&
                     activity.from && activity.from.role === "bot") {
            if (activity.type === "message") {
              responseVersion++;
              sendState("에이전트 응답 수신", "received");
            } else if (activity.type === "typing") {
              sendState("에이전트가 응답을 작성하고 있습니다.", "waiting");
            }
          }
          return next(action);
        };
      };
    });
  };
})(window);
