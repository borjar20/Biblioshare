import { describe, expect, it } from "vitest";
import { calibrate, checkCalibration, formatReport } from "./calibration";

// Matriz reducida (40 seeds por celda) para que corra en segundos; el CLI usa 200.
describe("calibración de R2", () => {
  it("interrumpir gana, pulsar a ciegas pierde, no pulsar pierde; duración en rango", () => {
    const report = calibrate({ seeds: 40 });
    const check = checkCalibration(report);
    if (!check.ok) console.log(formatReport(report));
    expect(check.failures).toEqual([]);
  }, 60_000);

  it("una cadena de tres tramos calibra con sus propios umbrales y reporta el tramo", () => {
    const report = calibrate({ seeds: 8, chain: 3, profiles: ["lectora_larga"], classes: ["wizard"] });
    expect(report.chain).toBe(3);
    expect(report.cells).toHaveLength(3);
    for (const c of report.cells) expect(c.fights).toBe(8);
    const failing = { ...report, cells: report.cells.map((c) => c.policy === "never" ? { ...c, wins: c.fights } : c) };
    expect(checkCalibration(failing).ok).toBe(false);
    expect(checkCalibration(failing).failures.join(" ")).toMatch(/never/);
  });
});
