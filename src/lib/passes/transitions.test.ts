import { describe, expect, it } from "vitest";
import { passEffect } from "./transitions";

describe("passEffect", () => {
  it("abre pase al empezar a leer", () => {
    expect(passEffect("planned", "in_progress", false)).toEqual({ kind: "open" });
  });

  it("no abre un segundo pase si ya hay uno abierto", () => {
    expect(passEffect("planned", "in_progress", true)).toEqual({ kind: "none" });
  });

  it("cierra el pase abierto al terminar", () => {
    expect(passEffect("in_progress", "completed", true)).toEqual({ kind: "close" });
  });

  it("abre y cierra de golpe cuando se marca visto sin haber empezado", () => {
    // El ciclo natural de una película: pendiente -> visto.
    expect(passEffect("planned", "completed", false)).toEqual({ kind: "openAndClose" });
    expect(passEffect(null, "completed", false)).toEqual({ kind: "openAndClose" });
  });

  it("abre un pase nuevo al releer algo ya terminado", () => {
    expect(passEffect("completed", "in_progress", false)).toEqual({ kind: "open" });
  });

  it("cierra el pase abierto al abandonar", () => {
    expect(passEffect("in_progress", "dropped", true)).toEqual({ kind: "close" });
  });

  it("no hace nada al abandonar algo que no habias empezado", () => {
    expect(passEffect("planned", "dropped", false)).toEqual({ kind: "none" });
  });

  it("no hace nada al volver a pendiente", () => {
    expect(passEffect("in_progress", "planned", true)).toEqual({ kind: "none" });
  });
});
