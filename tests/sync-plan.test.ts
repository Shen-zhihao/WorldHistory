import assert from "node:assert/strict";
import test from "node:test";
import { planSyncYears, type MonthCheck } from "../src/lib/server/sync-plan";

const now = Date.parse("2027-01-02T00:00:00Z");
const checked = new Map<string, MonthCheck>();
for (let y = 1800; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
  const month = `${y}-${String(m).padStart(2, "0")}`;
  checked.set(month, { month, checked_at: "2026-12-31T00:00:00Z", error: null });
}

test("startup refresh crosses a year boundary and catches late December events", () => {
  assert.deepEqual(planSyncYears("2027-01-02", "2026-12-20T00:00:00Z", checked, false, now), [2026, 2027]);
});

test("a failed historical source retries while complete fresh years remain cached", () => {
  const input = new Map(checked);
  input.set("1914-07", { month: "1914-07", checked_at: "2026-12-31T00:00:00Z", error: "HTTP 429" });
  assert.deepEqual(planSyncYears("2027-01-02", "2027-01-01T00:00:00Z", input, false, now), [1914, 2027]);
});
