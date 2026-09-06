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
});
