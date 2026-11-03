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
    if (activity && activity.type === "message" && typeof activity.text === "string" && activity.text) {
      P.conversations.record(context, activity, "outgoing");
      P.data.addHistory({ kind: "user", text: activity.text.slice(0, 200) }, context);
    }
  }

  P.createStore = function (context) {
    return WebChat.createStore({}, function () {
      return function (next) {
        return function (action) {
          try {
            if (action && action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
              handleIncoming(action.payload && action.payload.activity, context);
            } else if (action && action.type === "DIRECT_LINE/POST_ACTIVITY") {
              handleOutgoing(action.payload && action.payload.activity, context);
            }
          } catch (e) {
            if (window.console) console.warn("PanelLab observer error", e);
          }
          return next(action);
        };
      };
    });
  };
})(window);
