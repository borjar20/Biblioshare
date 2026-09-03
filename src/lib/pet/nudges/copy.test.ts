import { describe, expect, it } from "vitest";
import { petNudgeCopy } from "./copy";

// t de mentira: devuelve la clave con los valores interpolados, para afirmar
// clave y argumentos sin cargar es.json.
const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? ":" + JSON.stringify(values) : ""}`;

describe("petNudgeCopy", () => {
  it("racha: clave streakAtRisk con el número de días", () => {
    expect(petNudgeCopy("streak_at_risk", 7, t)).toEqual({ body: 'nudges.streakAtRisk:{"n":7}' });
  });

  it("humor: sleepy y sad, sin argumentos", () => {
    expect(petNudgeCopy("mood_sleepy", null, t)).toEqual({ body: "nudges.sleepy" });
    expect(petNudgeCopy("mood_sad", null, t)).toEqual({ body: "nudges.sad" });
  });

  it("racha sin número (fila corrupta) cae a 0 en vez de reventar", () => {
    expect(petNudgeCopy("streak_at_risk", null, t)).toEqual({ body: 'nudges.streakAtRisk:{"n":0}' });
  });
});
