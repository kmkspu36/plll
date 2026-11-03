(function (root) {
  "use strict";
  var P = root.PanelLab, items = [], busy = false, boundProject = null;
  var defaultPrompt = "첨부 이미지를 분석해 주세요. 이미지 종류, 확인된 정보, 주요 구성 요소, 회로·작화 구조, 분석 결과, 불확실한 정보, 추가 확인 사항과 추천 다음 작업을 구분해 주세요. 보이지 않는 주소·문자·배선은 추측하지 마세요. PLC 모델과 명령어 호환성은 확인 전까지 미정으로 유지해 주세요.";
  async function validate(file, maxBytes) {
    if (!file || !file.name || file.size === 0) throw new Error("빈 파일은 첨부할 수 없습니다.");
    if (file.size > maxBytes) throw new Error("파일 크기 제한은 " + Math.floor(maxBytes / 1024 / 1024) + "MB입니다.");
    var ext = file.name.split(".").pop().toLowerCase();
    var bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    var png = bytes.length === 8 && [137, 80, 78, 71, 13, 10, 26, 10].every(function (n, i) { return bytes[i] === n; });
    var jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (ext === "png" && file.type === "image/png" && png) return;
    if ((ext === "jpg" || ext === "jpeg") && file.type === "image/jpeg" && jpg) return;
    throw new Error("실제 PNG 또는 JPEG 이미지만 첨부할 수 있습니다. 확장자와 파일 형식을 확인하세요.");
  }
  function limits() {
    return P.uploadCapabilities || { verified: false, maxFiles: 1, maxBytes: 5 * 1024 * 1024 };
  }
  function element(tag, text, cls) {
    var e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e;
  }
  function status(message) { document.getElementById("attachmentStatus").textContent = message; }
  function release() { items.forEach(function (item) { URL.revokeObjectURL(item.url); }); items = []; }
  function render() {
    var list = document.getElementById("attachmentPreviews"); list.textContent = "";
    items.forEach(function (item, index) {
      var card = element("div", "", "attachment-preview"), img = element("img");
      img.src = item.url; img.alt = item.file.name; card.appendChild(img);
      card.appendChild(element("span", item.file.name + " · " + Math.ceil(item.file.size / 1024) + "KB", "fname"));
      var remove = element("button", "삭제", "btn sm"); remove.type = "button"; remove.disabled = busy;
      remove.onclick = function () { URL.revokeObjectURL(item.url); items.splice(index, 1); render(); };
      card.appendChild(remove); list.appendChild(card);
    });
    document.getElementById("attachmentSend").disabled = busy || !items.length || !P.connected || !limits().verified;
    document.getElementById("attachmentChoose").disabled = busy;
    document.getElementById("attachmentReplace").disabled = busy;
    document.getElementById("attachmentSave").disabled = busy || !items.length;
    document.getElementById("attachmentText").disabled = busy;
    document.getElementById("attachmentClose").disabled = busy;
    document.getElementById("attachmentCapability").textContent = limits().verified ?
      "운영자가 실채널 검증을 확인한 업로드 경로입니다. 최대 " + limits().maxFiles + "개, 파일당 " + Math.floor(limits().maxBytes / 1024 / 1024) + "MB. 전송과 분석 성공은 별개입니다." :
      "기존 에이전트의 이미지 입력이 아직 검증되지 않았습니다. 선택·미리보기·로컬 보관만 가능하며 서버로 전송하지 않습니다. 준비 기본 한도: 1개·5MB.";
  }
  async function addFiles(files, replace) {
    var candidates = Array.from(files), cap = limits();
    if (busy) throw new Error("진행 중인 작업이 끝난 뒤 첨부를 변경하세요.");
    if ((replace ? 0 : items.length) + candidates.length > cap.maxFiles) throw new Error("현재 첨부 한도는 " + cap.maxFiles + "개입니다.");
    busy = true; render();
    try {
      for (var file of candidates) {
        await validate(file, cap.maxBytes);
        var bitmap = await root.createImageBitmap(file);
        var pixels = bitmap.width * bitmap.height; bitmap.close();
        if (pixels > 40000000) throw new Error("이미지 해상도가 너무 큽니다. 4천만 픽셀 이하로 줄여 주세요.");
      }
      if (replace) release();
      candidates.forEach(function (file) { items.push({ file: file, url: URL.createObjectURL(file) }); });
      status("첨부 준비됨 · 아직 전송하지 않았습니다.");
    } finally { busy = false; render(); }
  }
  async function saveSelected() {
    var saved = [];
    for (var item of items) {
      var id = item.savedId || root.crypto.randomUUID();
      await P.storage.saveFile({
        id: id, projectId: boundProject, name: item.file.name, blob: item.file,
        createdAt: new Date().toISOString(), state: "local-only",
        conversationId: P.conversations.active() && P.conversations.active().id
      });
      item.savedId = id; saved.push(id);
    }
    root.dispatchEvent(new CustomEvent("panellab:files"));
    return saved;
  }
  function open() {
    if (busy) return;
    if (boundProject !== P.data.active().id) {
      release(); document.getElementById("attachmentText").value = "";
      boundProject = P.data.active().id;
    }
    render(); status("이미지를 선택하세요. 첨부만으로 서버에 전송되지 않습니다.");
    document.getElementById("attachmentDialog").showModal();
  }
  function init() {
    var picker = document.getElementById("attachmentPicker"), replace = false;
    document.getElementById("openAttachments").onclick = open;
    document.getElementById("welcomeAttachments").onclick = open;
    document.getElementById("attachmentChoose").onclick = function () { replace = false; picker.multiple = limits().maxFiles > 1; picker.click(); };
    document.getElementById("attachmentReplace").onclick = function () { replace = true; picker.multiple = limits().maxFiles > 1; picker.click(); };
    picker.onchange = async function () {
      try { await addFiles(picker.files, replace); } catch (error) { status(error.message); } finally { picker.value = ""; }
    };
    var dialog = document.getElementById("attachmentDialog");
    dialog.addEventListener("cancel", function (event) { if (busy) event.preventDefault(); });
    document.getElementById("attachmentClose").onclick = function () { dialog.close(); };
    document.getElementById("attachmentSave").onclick = async function () {
      busy = true; render();
      try { await saveSelected(); status("선택한 원본 이미지를 현재 프로젝트의 이 브라우저에 보관했습니다. AI에 전송하지 않았습니다."); }
      catch (error) { status("보관 실패: " + error.message); }
      finally { busy = false; render(); }
    };
    document.getElementById("attachmentForm").onsubmit = async function (event) {
      event.preventDefault();
      if (busy || !items.length || !P.connected || !limits().verified) { status("연결과 기존 에이전트의 파일 입력 검증이 필요합니다."); return; }
      if (boundProject !== P.data.active().id) { status("프로젝트가 변경되었습니다. 첨부를 다시 선택하세요."); return; }
      busy = true; render();
      try {
        var context = P.conversations.active();
        if (document.getElementById("keepAttachments").checked) await saveSelected();
        if (context !== P.conversations.active() || boundProject !== P.data.active().id) {
          throw new Error("대화 또는 프로젝트가 변경되었습니다. 현재 대화를 확인한 후 다시 전송하세요.");
        }
        var text = document.getElementById("attachmentText").value.trim() || defaultPrompt;
        if (!P.sendAttachments(items.map(function (item) { return item.file; }), text)) throw new Error("연결 또는 첨부 제한을 확인하세요.");
        status("Web Chat에 전송을 요청했습니다. 실제 업로드 결과는 채팅 전송 상태를 확인하세요.");
        release(); document.getElementById("attachmentText").value = ""; dialog.close();
      } catch (error) { status("전송 준비 실패: " + error.message); }
      finally { busy = false; render(); }
    };
    root.addEventListener("panellab:connection", render);
    root.addEventListener("beforeunload", release);
  }
  P.attachments = {
    init: init, open: open, validate: validate,
    useSaved: async function (record) {
      if (record.projectId !== P.data.active().id) throw new Error("다른 프로젝트의 이미지는 이 대화에 첨부할 수 없습니다.");
      open();
      await addFiles([new File([record.blob], record.name, { type: record.blob.type })], true);
      items[0].savedId = record.id;
    }
  };
})(window);
