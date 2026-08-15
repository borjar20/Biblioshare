import { describe, expect, it } from "vitest";
import { planTransition } from "./transitions";

const HOY = "2026-07-16";

describe("planTransition", () => {
  // Sin pase activo: añadir a biblioteca / película vista de golpe
  it("sin activo, a planned → crea activo pendiente, sella planned_on", () => {
    expect(planTransition(null, "planned", HOY)).toEqual({
      kind: "createActive", status: "planned", startedOn: null, finishedOn: null, plannedOn: HOY,
    });
  });
  it("sin activo, a in_progress → crea activo leyendo (nunca pisó la pila)", () => {
    expect(planTransition(null, "in_progress", HOY)).toEqual({
      kind: "createActive", status: "in_progress", startedOn: HOY, finishedOn: null, plannedOn: null,
    });
  });
  it("sin activo, a completed → crea activo ya cerrado (película vista)", () => {
    expect(planTransition(null, "completed", HOY)).toEqual({
      kind: "createActive", status: "completed", startedOn: HOY, finishedOn: HOY, plannedOn: null,
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
  it("sin activo, a dropped → crea activo ya cerrado (abandono directo)", () => {
    expect(planTransition(null, "dropped", HOY)).toEqual({
      kind: "createActive", status: "dropped", startedOn: HOY, finishedOn: HOY, plannedOn: null,
    });
  });
  it("planned → dropped cierra de golpe (película abandonada desde pendiente)", () => {
    expect(planTransition({ id: "p1", status: "planned" }, "dropped", HOY)).toEqual({
      kind: "updateActive", set: { status: "dropped", finished_on: HOY },
    });
  });
  it("in_progress → planned reabre como pendiente sin perder started_on, sella planned_on", () => {
    expect(planTransition({ id: "p1", status: "in_progress" }, "planned", HOY)).toEqual({
      kind: "updateActive", set: { status: "planned", planned_on: HOY },
    });
  });

  // Pase cerrado: relectura y retomar
  it("completed → in_progress = relectura: archiva y abre pase nuevo", () => {
    expect(planTransition({ id: "p1", status: "completed" }, "in_progress", HOY)).toEqual({
      kind: "archiveAndCreate", status: "in_progress", startedOn: HOY, plannedOn: null,
    });
  });
  it("completed → planned = quiero releerlo: archiva y abre pendiente, sella planned_on", () => {
    expect(planTransition({ id: "p1", status: "completed" }, "planned", HOY)).toEqual({
      kind: "archiveAndCreate", status: "planned", startedOn: null, plannedOn: HOY,
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
    ).toEqual({ kind: "archiveAndCreate", status: "in_progress", startedOn: HOY, plannedOn: null });
  });
  it("dropped → completed corrige el cierre en el mismo pase", () => {
    expect(planTransition({ id: "p1", status: "dropped" }, "completed", HOY)).toEqual({
      kind: "updateActive", set: { status: "completed", finished_on: HOY },
    });
  });
});
