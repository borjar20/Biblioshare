import { describe, expect, it } from "vitest";
import { describeProgress } from "./kind-metrics";
import type { ActivityProgress } from "./progress";

// Traductor de mentira: devuelve la clave y los valores, así el test comprueba
// QUÉ clave se elige sin depender del texto de messages/es.json.
const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${Object.values(values).join(",")})` : key;

const prog = (over: Partial<ActivityProgress> = {}): ActivityProgress => ({
  collective: { done: 3, total: 5 },
  viewer: { done: 4, total: 5 },
  participants: 6,
  ...over,
});

describe("describeProgress", () => {
  it("buddy_read cuenta hitos", () => {
    const labels = describeProgress("buddy_read", prog(), t);
    expect(labels.collectiveLabel).toBe("metricCheckpoints(3,5)");
    expect(labels.viewerLabel).toBe("metricCheckpoints(4,5)");
    expect(labels.collectivePercent).toBe(60);
    expect(labels.viewerPercent).toBe(80);
  });

  it("list_challenge cuenta ítems completados", () => {
    expect(describeProgress("list_challenge", prog(), t).collectiveLabel).toBe(
      "metricCompleted(3,5)",
    );
  });

  it("criteria_challenge cuenta conseguidos", () => {
    expect(describeProgress("criteria_challenge", prog(), t).collectiveLabel).toBe(
      "metricAchieved(3,5)",
    );
  });

  it("tierlist cuenta votantes, no ítems", () => {
    const labels = describeProgress("tierlist", prog({ collective: { done: 4, total: 6 } }), t);
    expect(labels.collectiveLabel).toBe("metricVoted(4,6)");
  });

  it("sin denominador NO hay barra: nada de un 0% que parece progreso", () => {
    const labels = describeProgress("buddy_read", prog({ collective: null }), t);
    expect(labels.collectiveLabel).toBeNull();
    expect(labels.collectivePercent).toBeNull();
  });

  it("quien no participa no tiene barra propia", () => {
    expect(describeProgress("buddy_read", prog({ viewer: null }), t).viewerLabel).toBeNull();
  });

  it("sin progreso cargado devuelve todo a null, sin reventar", () => {
    const labels = describeProgress("buddy_read", undefined, t);
    expect(labels.collectiveLabel).toBeNull();
    expect(labels.viewerPercent).toBeNull();
  });

  it("un evento no tiene métrica: nunca llega a esta tarjeta, pero no debe romper", () => {
    expect(describeProgress("evento", prog(), t).collectiveLabel).toBeNull();
  });
});
