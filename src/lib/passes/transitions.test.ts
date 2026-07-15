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

import { planTransition } from "./transitions";

const HOY = "2026-07-16";

describe("planTransition", () => {
  // Sin pase activo: añadir a biblioteca / película vista de golpe
  it("sin activo, a planned → crea activo pendiente", () => {
    expect(planTransition(null, "planned", HOY)).toEqual({
      kind: "createActive", status: "planned", startedOn: null, finishedOn: null,
    });
  });
  it("sin activo, a in_progress → crea activo leyendo", () => {
    expect(planTransition(null, "in_progress", HOY)).toEqual({
      kind: "createActive", status: "in_progress", startedOn: HOY, finishedOn: null,
    });
  });
  it("sin activo, a completed → crea activo ya cerrado (película vista)", () => {
    expect(planTransition(null, "completed", HOY)).toEqual({
      kind: "createActive", status: "completed", startedOn: HOY, finishedOn: HOY,
    });
  });

  // Mismo estado = no-op
  it("mismo estado → none", () => {
    expect(planTransition({ id: "p1", status: "in_progress" }, "in_progress", HOY))
      .toEqual({ kind: "none" });
  });

  // Pase abierto
  it("planned → in_progress sella started_on en el MISMO pase", () => {
    expect(planTransition({ id: "p1", status: "planned" }, "in_progress", HOY)).toEqual({
      kind: "updateActive", set: { status: "in_progress", started_on: HOY },
    });
  });
  it("in_progress → completed cierra el pase", () => {
    expect(planTransition({ id: "p1", status: "in_progress" }, "completed", HOY)).toEqual({
      kind: "updateActive", set: { status: "completed", finished_on: HOY },
    });
  });
  it("planned → completed cierra de golpe (película)", () => {
    expect(planTransition({ id: "p1", status: "planned" }, "completed", HOY)).toEqual({
      kind: "updateActive", set: { status: "completed", started_on: HOY, finished_on: HOY },
    });
  });
  it("in_progress → dropped congela el cursor y cierra", () => {
    expect(planTransition({ id: "p1", status: "in_progress" }, "dropped", HOY)).toEqual({
      kind: "updateActive", set: { status: "dropped", finished_on: HOY },
    });
  });
  it("in_progress → planned reabre como pendiente sin perder started_on", () => {
    expect(planTransition({ id: "p1", status: "in_progress" }, "planned", HOY)).toEqual({
      kind: "updateActive", set: { status: "planned" },
    });
  });

  // Pase cerrado: relectura y retomar
  it("completed → in_progress = relectura: archiva y abre pase nuevo", () => {
    expect(planTransition({ id: "p1", status: "completed" }, "in_progress", HOY)).toEqual({
      kind: "archiveAndCreate", status: "in_progress", startedOn: HOY,
    });
  });
  it("completed → planned = quiero releerlo: archiva y abre pendiente", () => {
    expect(planTransition({ id: "p1", status: "completed" }, "planned", HOY)).toEqual({
      kind: "archiveAndCreate", status: "planned", startedOn: null,
    });
  });
  it("dropped → in_progress sin elección → pide la hoja de retomar", () => {
    expect(planTransition({ id: "p1", status: "dropped" }, "in_progress", HOY))
      .toEqual({ kind: "askResume" });
  });
  it("dropped → in_progress con 'continue' reabre el MISMO pase", () => {
    expect(
      planTransition({ id: "p1", status: "dropped" }, "in_progress", HOY, "continue")
    ).toEqual({
      kind: "updateActive", set: { status: "in_progress", finished_on: null },
    });
  });
  it("dropped → in_progress con 'restart' archiva y abre de cero", () => {
    expect(
      planTransition({ id: "p1", status: "dropped" }, "in_progress", HOY, "restart")
    ).toEqual({ kind: "archiveAndCreate", status: "in_progress", startedOn: HOY });
  });
  it("dropped → completed corrige el cierre en el mismo pase", () => {
    expect(planTransition({ id: "p1", status: "dropped" }, "completed", HOY)).toEqual({
      kind: "updateActive", set: { status: "completed", finished_on: HOY },
    });
  });
});
