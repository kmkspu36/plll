(function (root) {
  "use strict";
  function parseIL(source) {
    var lines = source.split(/\r?\n/).map(function (line) { return line.replace(/;.*$/, "").trim(); }).filter(Boolean);
    var rungs = [], current = null, ended = false;
    for (var i = 0; i < lines.length; i++) {
      if (ended) return null;
      var tokens = lines[i].toUpperCase().split(/\s+/), op = tokens[0], device = tokens[1];
      if (op === "END" && tokens.length === 1) {
        if (!current || current.coils.length !== 1) return null;
        ended = true; continue;
      }
      if (tokens.length !== 2 || !/^[XYMDTCLBWRSV][0-9A-F]+$/.test(device)) return null;
      if (op === "LD" || op === "LDI") {
        if (current && current.coils.length !== 1) return null;
        current = { els: [{ main: { neg: op === "LDI", dev: device }, alts: [] }], coils: [] };
        rungs.push(current);
      } else if ((op === "AND" || op === "ANI") && current && !current.coils.length) {
        current.els.push({ main: { neg: op === "ANI", dev: device }, alts: [] });
      } else if (["OUT", "SET", "RST"].indexOf(op) >= 0 && current && !current.coils.length) {
        current.coils.push({ kind: op, dev: device });
      } else return null;
    }
    return current && current.coils.length === 1 ? rungs : null;
  }
  var api = { parseIL: parseIL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PanelLab.ladder = api;
})(typeof window !== "undefined" ? window : globalThis);
