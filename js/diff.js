/* Line diff (LCS). Returns [{t:"same"|"add"|"del", text}] */
(function (root) {
  "use strict";
  function diffLines(a, b) {
    var x = a.split("\n"), y = b.split("\n");
    var n = x.length, m = y.length, i, j;
    if (n * m > 1000000) throw new RangeError("코드가 커서 줄 단위 비교를 생략했습니다. 수정 전후 원문을 확인해 주세요.");
    var L = [];
    for (i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { out.push({ t: "same", text: x[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ t: "del", text: x[i++] }); }
      else { out.push({ t: "add", text: y[j++] }); }
    }
    while (i < n) out.push({ t: "del", text: x[i++] });
    while (j < m) out.push({ t: "add", text: y[j++] });
    return out;
  }
  var api = { diffLines: diffLines };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PanelLab = root.PanelLab || {}; root.PanelLab.diff = api; }
})(typeof window !== "undefined" ? window : globalThis);
