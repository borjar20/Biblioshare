import { describe, expect, it } from "vitest";
import { makeEvent } from "./events";
import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import type { EventLog, PlayEvent } from "./types";

const startedEv = makeEvent("game_started", { toolId: "commander", setup: {} }, 1000, "e-start");
const tap = (delta: number, at: number, target = "ana", id?: string): PlayEvent =>
  makeEvent("life_changed", { target, delta }, at, id ?? `t-${at}`);

const fresh = (): EventLog => emptyLog(startedEv);

describe("appendTap — coalescing en la ráfaga pendiente", () => {
  it("funde taps del mismo tipo+target dentro de la ventana", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2500));
    log = appendTap(log, tap(-3, 3000));
    expect(log.committed).toHaveLength(1); // solo game_started
    expect(log.pending?.payload).toEqual({ target: "ana", delta: -5 });
    expect(log.pending?.at).toBe(3000);
  });

  it("delta neto 0 descarta la ráfaga", () => {
    let log = appendTap(fresh(), tap(-2, 2000));
    log = appendTap(log, tap(2, 2500));
    expect(log.pending).toBeNull();
    expect(log.committed).toHaveLength(1);
  });

  it("target distinto sella la ráfaga anterior y abre otra", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2100, "borja"));
    expect(log.committed).toHaveLength(2);
    expect(log.committed[1].payload).toEqual({ target: "ana", delta: -1 });
    expect(log.pending?.payload).toEqual({ target: "borja", delta: -1 });
  });

  it("fuera de ventana sella; un at que RETROCEDE también sella (reloj corregido, spec §3)", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2000 + BURST_WINDOW_MS + 1));
    expect(log.committed).toHaveLength(2);
    log = appendTap(log, tap(-1, 1000)); // retrocede
    expect(log.committed).toHaveLength(3);
    expect(log.pending?.at).toBe(1000);
  });

  it("commander_damage solo funde con mismo source Y target", () => {
    const cd = (source: string, at: number) =>
      makeEvent("commander_damage", { source, target: "ana", delta: 1 }, at, `cd-${source}-${at}`);
    let log = appendTap(fresh(), cd("carlos", 2000));
    log = appendTap(log, cd("carlos", 2100));
    expect(log.pending?.payload).toEqual({ source: "carlos", target: "ana", delta: 2 });
    log = appendTap(log, cd("laura", 2200)); // otro atacante: sella
    expect(log.committed).toHaveLength(2);
  });

  it("un evento no coalescable committea directo y sella lo pendiente", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = append(log, makeEvent("turn_passed", {}, 2100, "e-turn"));
    expect(log.committed.map((e) => e.type)).toEqual(["game_started", "life_changed", "turn_passed"]);
    expect(log.pending).toBeNull();
  });
});

describe("inmutabilidad", () => {
  it("ningún evento ya committeado cambia jamás al operar sobre el log", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = flushPending(log);
    const frozen = JSON.stringify(log.committed);
    log = appendTap(log, tap(-1, 5000));
    log = flushPending(log);
    log = appendTap(log, tap(-1, 9000));
    expect(JSON.stringify(log.committed.slice(0, 2))).toBe(frozen);
  });
});

describe("undoLast", () => {
  it("con pending, el primer undo descarta la ráfaga; el siguiente hace pop del committeado", () => {
    let log = appendTap(fresh(), tap(-5, 2000));
    log = flushPending(log);
    log = appendTap(log, tap(-3, 4000));
    const first = undoLast(log);
    expect(first.undone?.payload).toEqual({ target: "ana", delta: -3 });
    expect(first.log.committed).toHaveLength(2);
    const second = undoLast(first.log);
    expect(second.undone?.payload).toEqual({ target: "ana", delta: -5 });
    expect(second.log.committed).toHaveLength(1);
  });

  it("game_started no es deshacible", () => {
    const res = undoLast(fresh());
    expect(res.undone).toBeNull();
    expect(res.log.committed).toHaveLength(1);
  });
});
