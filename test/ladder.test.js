"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseIL } = require("../js/ladder.js");
const { diffLines } = require("../js/diff.js");

test("only complete serial rungs are visualized", () => {
  const rungs = parseIL("LD X0\nANI X1\nOUT Y0\nLDI M10\nAND X2\nSET M0\nEND");
  assert.equal(rungs.length, 2);
  assert.equal(rungs[0].els[1].main.neg, true);
  assert.equal(rungs[1].coils[0].kind, "SET");
});
test("unsupported logic is rejected rather than changing accumulated OR semantics", () => {
  for (const source of [
    "LD X0\nAND X1\nOR X2\nOUT Y0",
    "LD X0\nOUT Y0\nOUT Y1",
    "LD X0\nAND X1", "LD X0 extra\nOUT Y0",
    "LD X0\nMOV K1 D0", "LD X0\nOUT Y0\nEND\nLD X1\nOUT Y1",
    "LD X0\nLD X1\nOUT Y0", "", "END"
  ]) assert.equal(parseIL(source), null, source);
});
test("large diffs are bounded instead of allocating an unbounded matrix", () => {
  assert.throws(() => diffLines("a\n".repeat(1100), "b\n".repeat(1100)), RangeError);
});
