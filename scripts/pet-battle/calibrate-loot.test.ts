import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCases, measureLootCases } from "./calibrate-loot";

test("covers mixed qualities as well as empty equipment", () => {
  const cases = buildCases();
  assert.equal(cases.length, 256);
  assert.ok(cases.some(c => c.weaponQuality === 8000 && c.amuletQuality === 12000));
  assert.equal(new Set(cases.map(c => JSON.stringify(c))).size, 256);
});

test("a real simulation is reproducible and counts every seed", async () => {
  const options = { profiles: ["nueva"] as const, scenarios: ["random"] as const,
    policies: ["interrupt_ulti"] as const, cases: buildCases().slice(0, 2) };
  const a = await measureLootCases([0, 1], options);
  assert.deepEqual(a, await measureLootCases([0, 1], options));
  assert.equal(a.length, 2);
  assert.ok(a.every(m => m.samples === 2 && m.meanTicks > 0 && m.meanHp >= 0));
});

test("stratified quality sampling assigns each seed once and pairs every build", async () => {
  const cases = buildCases().slice(0, 2);
  const metrics = await measureLootCases([0, 1, 11, 65, 66], { qualityStrata:true, cases, policies:["never"] });
  for (const c of cases) {
    const rows = metrics.filter(m => m.amulet === c.amulet && m.amuletQuality === c.amuletQuality);
    assert.equal(rows.reduce((n, m) => n + m.samples, 0), 5);
    assert.ok(rows.some(m => m.profile === "seriefila"));
  }
});
