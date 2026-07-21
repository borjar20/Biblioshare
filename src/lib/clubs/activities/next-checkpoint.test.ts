import { describe, expect, it } from "vitest";
import { nextCheckpoint } from "./next-checkpoint";

type Cp = Parameters<typeof nextCheckpoint>[0][number];

function cp(label: string, status: Cp["status"]): Cp {
  return { label, status } as Cp;
}

describe("nextCheckpoint", () => {
  it("devuelve el primero no confirmado", () => {
    const result = nextCheckpoint([
      cp("Hito 1", "confirmed"),
      cp("Hito 2", "confirmed"),
      cp("Hito 3", "locked"),
      cp("Hito 4", "suggested"),
    ]);
    expect(result?.label).toBe("Hito 3");
  });

  it("devuelve null si todos están confirmados", () => {
    expect(nextCheckpoint([cp("Hito 1", "confirmed")])).toBeNull();
  });

  it("devuelve null con la lista vacía", () => {
    expect(nextCheckpoint([])).toBeNull();
  });

  it("no asume que los confirmados vengan primero", () => {
    const result = nextCheckpoint([
      cp("Hito 1", "suggested"),
      cp("Hito 2", "confirmed"),
    ]);
    expect(result?.label).toBe("Hito 1");
  });
});
