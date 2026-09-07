import { describe, expect, it } from "vitest";
import { calibrate, checkCalibration, formatReport, type CalibrationCell, type CalibrationReport } from "./calibration";

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
    expect(report.cells).toHaveLength(4);
    for (const c of report.cells) expect(c.fights).toBe(8);
  });

  it("en cadena, la banda se aplica a interrupt_ulti (no a interrupt) y a never", () => {
    // Reporte sintético (100 combates por celda) para poder fijar porcentajes exactos,
    // en vez de depender del muestreo real de calibrate().
    const FIGHTS = 100;
    const cell = (policy: CalibrationCell["policy"], wins: number): CalibrationCell => ({
      profile: "lectora_larga", petClass: "wizard", policy, fights: FIGHTS, wins, draws: 0, meanTicks: 900,
    });
    const reportWith = (winsByPolicy: Record<string, number>): CalibrationReport => ({
      seeds: FIGHTS,
      chain: 3,
      cells: (Object.keys(winsByPolicy) as CalibrationCell["policy"][]).map((policy) => cell(policy, winsByPolicy[policy])),
    });

    // interrupt_ulti al 60 % (dentro de [50 %, 75 %]), never al 0 %, interrupt disparatado: sin fallos.
    const ok = reportWith({ interrupt_ulti: 60, never: 0, interrupt: 100 });
    expect(checkCalibration(ok).ok).toBe(true);

    // interrupt_ulti al 40 % (fuera de banda por abajo): falla nombrando interrupt_ulti.
    const lowUlti = reportWith({ interrupt_ulti: 40, never: 0 });
    const lowCheck = checkCalibration(lowUlti);
    expect(lowCheck.ok).toBe(false);
    expect(lowCheck.failures.join(" ")).toMatch(/interrupt_ulti/);

    // never al 2 % (≤ 3 %): pasa, aunque el 2 % siga siendo el ruido de muestreo real a 200 seeds.
    const lowNever = reportWith({ interrupt_ulti: 60, never: 2 });
    expect(checkCalibration(lowNever).ok).toBe(true);

    // never al 4 % (> 3 %): falla nombrando never, aunque interrupt_ulti esté en banda.
    const highNever = reportWith({ interrupt_ulti: 60, never: 4 });
    const neverCheck = checkCalibration(highNever);
    expect(neverCheck.ok).toBe(false);
    expect(neverCheck.failures.join(" ")).toMatch(/never/);
  });
});
