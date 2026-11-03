(function (root) {
  "use strict";
  var observer, frame;
  function decorate(container) {
    container.querySelectorAll(".webchat__bubble__content pre").forEach(function (pre) {
      if (pre.dataset.panellabCode) return;
      var code = pre.querySelector("code");
      if (!code) return;
      pre.dataset.panellabCode = "true";
      pre.classList.add("native-code-card");
      var toolbar = document.createElement("div"); toolbar.className = "native-code-toolbar";
      var label = document.createElement("span"); label.textContent = "코드 원문";
      var copy = document.createElement("button"); copy.type = "button"; copy.className = "btn sm"; copy.textContent = "코드 복사";
      copy.onclick = async function () {
        try {
          if (!root.navigator.clipboard || !root.navigator.clipboard.writeText) throw new Error("이 브라우저에서는 클립보드 복사를 지원하지 않습니다.");
          await root.navigator.clipboard.writeText(code.textContent);
          copy.textContent = "복사됨";
        } catch (error) {
          root.dispatchEvent(new CustomEvent("panellab:error", { detail: "코드 복사 실패: " + error.message }));
        }
      };
      toolbar.appendChild(label); toolbar.appendChild(copy); pre.insertBefore(toolbar, code);
    });
  }
  function stop() {
    if (observer) observer.disconnect();
    if (frame) root.cancelAnimationFrame(frame);
    observer = null; frame = null;
  }
  function observe(container) {
    stop();
    observer = new MutationObserver(function () {
      if (frame) return;
      frame = root.requestAnimationFrame(function () { frame = null; decorate(container); });
    });
    observer.observe(container, { childList: true, subtree: true });
    decorate(container);
  }
  root.PanelLab.presentation = { observe: observe, stop: stop, decorate: decorate };
})(window);
