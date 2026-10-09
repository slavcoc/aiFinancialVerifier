import test from "node:test";
import assert from "node:assert/strict";
import { repairCandidates } from "../src/json-repair.js";

const FULL = `{"relations":[
{"id":"r1","type":"sum","label":"revenue total","source":"table","parts":[{"text":"$26,100","kind":"money"},{"text":"$4,800","kind":"money"}],"total":{"text":"$30,900","kind":"money"}},
{"id":"r2","type":"difference","label":"gross profit","source":"table","a":{"text":"$30,900","kind":"money"},"b":{"text":"$8,500","kind":"money"},"result":{"text":"$22,400","kind":"money"}}
]}`;

function firstParsing(candidates) {
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* next */
    }
  }
  return null;
}

test("repair salvages complete relations when the tail is cut mid-object", () => {
  // cut inside r2's nested object — r1 is complete, r2 is not
  const cutAt = FULL.indexOf('"id":"r2"') + 12;
  const truncated = FULL.slice(0, cutAt);
  const repaired = firstParsing(repairCandidates(truncated));
  assert.ok(repaired);
  assert.equal(repaired.relations.length, 1);
  assert.equal(repaired.relations[0].id, "r1");
  assert.equal(repaired.relations[0].parts.length, 2);
});

test("repair closes an array cut right after a complete relation", () => {
  const truncated = FULL.slice(0, FULL.indexOf(`]}`));
  const repaired = firstParsing(repairCandidates(truncated));
  assert.ok(repaired);
  assert.equal(repaired.relations.length, 2);
});

test("repair never fabricates: nothing salvageable → no candidate parses", () => {
  const truncated = `{"relations":[{"id":"r1","type":"sum","label":"x","parts":[{"text":"$1","kind":"money"}`;
  assert.equal(firstParsing(repairCandidates(truncated)), null);
});
