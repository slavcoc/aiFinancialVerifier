import test from "node:test";
import assert from "node:assert/strict";
import { parseValue } from "../src/parser.js";

test("money: dollar with commas", () => {
  assert.equal(parseValue("$85,000", "money"), 85000);
});

test("money: M suffix", () => {
  assert.equal(parseValue("$1.2M", "money"), 1200000);
});

test("money: european decimal comma + thousands dot", () => {
  assert.equal(parseValue("€4.500,50", "money"), 4500.5);
});

test("money: thin-space thousands", () => {
  assert.equal(parseValue("4 500", "money"), 4500);
});

test("money: word million", () => {
  assert.equal(parseValue("2.5 million", "money"), 2500000);
});

test("money: dollars word", () => {
  assert.equal(parseValue("85,000 dollars", "money"), 85000);
});

test("money: accounting parens are negative", () => {
  assert.equal(parseValue("($1,200)", "money"), -1200);
});

test("pct: sign", () => {
  assert.equal(parseValue("12%", "pct"), 12);
});

test("pct: percent word", () => {
  assert.equal(parseValue("12 percent", "pct"), 12);
});

test("year: plain", () => {
  assert.equal(parseValue("2023", "year"), 2023);
});

test("year: FY prefix", () => {
  assert.equal(parseValue("FY2023", "year"), 2023);
});

test("number: european comma decimal", () => {
  assert.equal(parseValue("1,5", "number"), 1.5);
});

test("number: comma thousands", () => {
  assert.equal(parseValue("1,500", "number"), 1500);
});

test("invalid → null", () => {
  assert.equal(parseValue("abc", "number"), null);
  assert.equal(parseValue("", "money"), null);
  assert.equal(parseValue("202", "year"), null);
});
