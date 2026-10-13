import { test } from "node:test";
import assert from "node:assert/strict";
import { money, moneyCompact, percent, seconds, number, timeAgo } from "./format.js";

test("money and compact money", () => {
  assert.equal(money(4074285.31), "$4,074,285");
  assert.equal(money(2.7401), "$2.74");
  assert.equal(money(null), "–");
  assert.equal(moneyCompact(4074285.31), "$4.07M");
  assert.equal(moneyCompact(455227.87), "$455K");
  assert.equal(moneyCompact(48594.24), "$48.6K");
});

test("percent, seconds, number", () => {
  assert.equal(percent(0.2961), "29.6%");
  assert.equal(percent(undefined), "–");
  assert.equal(seconds(47.9), "47.9s");
  assert.equal(number(1486905), "1,486,905");
});

test("timeAgo", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(timeAgo("2026-10-13T11:59:58Z", now), "just now");
  assert.equal(timeAgo("2026-10-13T11:59:18Z", now), "42s ago");
  assert.equal(timeAgo("2026-10-13T11:55:00Z", now), "5m ago");
  assert.equal(timeAgo("2026-10-13T09:00:00Z", now), "3h ago");
});