import { describe, expect, it } from "vitest";
import { initialMtgState } from "@/lib/play/mtg/reducer";
import { makeEvent } from "@/lib/play/core/events";
import type { GameStartedEvent } from "@/lib/play/mtg/events";
import type { MtgSetup } from "@/lib/play/mtg/types";
import {
  addCommander,
  assignRegular,
  assignSelf,
  draftFromSetup,
  newDraft,
  removeCommander,
  setMode,
  setPlayerCount,
  toSetup,
  updateCommander,
  updatePlayer,
} from "./setup-draft";

const nombrePorDefecto = (i: number) => `Jugador ${i + 1}`;

const arrancar = (setup: MtgSetup) =>
  initialMtgState(
    makeEvent("game_started", { toolId: "mtg" as const, setup }, 1000, "e1") as GameStartedEvent,
  );

describe("borrador de configuración", () => {
  it("abre con cuatro jugadores, en blanco, y las vidas del modo", () => {
    // Cero es un camino de primera: la gente monta esto con la mesa puesta y las
    // cartas repartidas. Escribir nombres es opcional, no un peaje.
    const draft = newDraft("commander");
    expect(draft.players).toHaveLength(4);
    expect(draft.startingLife).toBe(40);
    expect(draft.players.every((p) => p.name === "")).toBe(true);
  });

  it("lo que sale del borrador ARRANCA en el motor sin tocar nada", () => {
    expect(() => arrancar(toSetup(newDraft("commander"), nombrePorDefecto))).not.toThrow();
    expect(() => arrancar(toSetup(newDraft("duel"), nombrePorDefecto))).not.toThrow();
    for (const n of [2, 3, 4, 5, 6]) {
      const draft = setPlayerCount(newDraft("commander"), n);
      expect(() => arrancar(toSetup(draft, nombrePorDefecto)), `${n} jugadores`).not.toThrow();
    }
  });

  it("cada jugador sale con al menos un comandante, aunque nadie escriba nada", () => {
    const setup = toSetup(newDraft("commander"), nombrePorDefecto);
    expect(setup.participants.every((p) => p.commanders.length >= 1)).toBe(true);
  });

  it("los nombres vacíos se rellenan con el texto que le pasa la UI", () => {
    // El módulo no importa next-intl: la traducción entra como argumento.
    const setup = toSetup(newDraft("commander"), nombrePorDefecto);
    expect(setup.participants[2].name).toBe("Jugador 3");
  });

  it("un nombre escrito se conserva y se recorta", () => {
    const draft = updatePlayer(newDraft("commander"), 0, { name: "  Ana  " });
    expect(toSetup(draft, nombrePorDefecto).participants[0].name).toBe("Ana");
  });

  it("mazo y comandante en blanco no viajan como cadena vacía", () => {
    const setup = toSetup(newDraft("commander"), nombrePorDefecto);
    expect(setup.participants[0].deckName).toBeUndefined();
    expect(setup.participants[0].commanders[0].name).toBeUndefined();
  });

  it("el comandante escrito sí viaja, con su nombre", () => {
    const draft = updateCommander(newDraft("commander"), 0, 0, "Atraxa");
    expect(toSetup(draft, nombrePorDefecto).participants[0].commanders[0].name).toBe("Atraxa");
  });

  it("cambiar de modo ajusta las vidas y recorta la mesa a lo que el modo admite", () => {
    const draft = setMode(newDraft("commander"), "duel");
    expect(draft.startingLife).toBe(20);
    expect(draft.players).toHaveLength(2);
  });

  it("cambiar de modo también recorta los comandantes de más", () => {
    // Duelo admite uno por asiento; Commander, dos.
    let draft = addCommander(newDraft("commander"), 0);
    expect(draft.players[0].commanders).toHaveLength(2);
    draft = setMode(draft, "duel");
    expect(draft.players[0].commanders).toHaveLength(1);
    expect(() => arrancar(toSetup(draft, nombrePorDefecto))).not.toThrow();
  });

  it("no deja quitar el último comandante de un asiento", () => {
    // Si no existiera, el daño de comandante no tendría a qué atribuirse.
    const draft = removeCommander(newDraft("commander"), 0, 0);
    expect(draft.players[0].commanders).toHaveLength(1);
  });

  it("no añade más comandantes de los que el modo admite", () => {
    let draft = addCommander(newDraft("commander"), 0);
    draft = addCommander(draft, 0);
    expect(draft.players[0].commanders).toHaveLength(2);
    expect(addCommander(newDraft("duel"), 0).players[0].commanders).toHaveLength(1);
  });

  it("bajar el número de jugadores no puede dejar el turno inicial fuera de la mesa", () => {
    let draft = { ...newDraft("commander"), startingSeat: 3 };
    draft = setPlayerCount(draft, 2);
    expect(draft.startingSeat).toBeLessThan(2);
    expect(() => arrancar(toSetup(draft, nombrePorDefecto))).not.toThrow();
  });

  it("subir y bajar el número de jugadores no pierde lo escrito en los que siguen", () => {
    let draft = updatePlayer(newDraft("commander"), 0, { name: "Ana" });
    draft = setPlayerCount(draft, 6);
    draft = setPlayerCount(draft, 4);
    expect(draft.players[0].name).toBe("Ana");
  });

  it("los ids de comandante son únicos en toda la mesa (el motor lo exige)", () => {
    const setup = toSetup(addCommander(newDraft("commander"), 1), nombrePorDefecto);
    const ids = setup.participants.flatMap((p) => p.commanders.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("quitar el primer comandante de un asiento con partner no deja ids colgando", () => {
    let draft = addCommander(newDraft("commander"), 0);
    draft = removeCommander(draft, 0, 0);
    const ids = toSetup(draft, nombrePorDefecto).participants.flatMap((p) =>
      p.commanders.map((c) => c.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => arrancar(toSetup(draft, nombrePorDefecto))).not.toThrow();
  });

  it("ida y vuelta: de un setup a borrador y otra vez a setup no cambia nada", () => {
    // Es lo que hace fiable la revancha: la mesa recordada entra al formulario y
    // sale igual si no se toca.
    const original = toSetup(
      updateCommander(addCommander(newDraft("commander"), 0), 0, 1, "Thrasios"),
      nombrePorDefecto,
    );
    expect(toSetup(draftFromSetup(original), nombrePorDefecto)).toEqual(original);
  });

  it("el fondo de tarjeta sobrevive la ida y vuelta, y viaja como referencia", () => {
    const draft = updatePlayer(newDraft("commander"), 0, { cardBackground: "seat-3" });
    const setup = toSetup(draft, nombrePorDefecto);
    expect(setup.participants[0].cardBackground).toBe("seat-3");
    expect(toSetup(draftFromSetup(setup), nombrePorDefecto)).toEqual(setup);
  });
});

describe("habituales en el borrador (fase 6)", () => {
  it("assignRegular fija nombre y playerId; toSetup emite kind regular", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    expect(draft.players[0]).toMatchObject({ name: "Pablo", playerId: "j1" });
    const setup = toSetup(draft, (i) => `J${i + 1}`);
    expect(setup.participants[0]).toMatchObject({ kind: "regular", name: "Pablo", playerId: "j1" });
    expect(setup.participants[1].kind).toBe("guest");
  });

  it("editar el nombre de un asiento asignado lo degrada a invitado", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    const edited = updatePlayer(draft, 0, { name: "Pablo M" });
    expect(edited.players[0].playerId).toBeUndefined();
    expect(toSetup(edited, (i) => `J${i + 1}`).participants[0].kind).toBe("guest");
  });

  it("editar el mazo NO degrada (solo el nombre identifica)", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    expect(updatePlayer(draft, 0, { deckName: "Vampiros" }).players[0].playerId).toBe("j1");
  });

  it("draftFromSetup conserva playerId de los regular", () => {
    const setup = toSetup(assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" }), (i) => `J${i + 1}`);
    expect(draftFromSetup(setup).players[0].playerId).toBe("j1");
  });
});

describe("asiento «Yo» (issue #985)", () => {
  it("assignSelf fija nombre y userId; toSetup emite kind user con extras mtg", () => {
    let draft = assignSelf(newDraft("commander"), 0, { userId: "uid-1", name: "Borja" });
    draft = updatePlayer(draft, 0, { deckName: "Vampiros" });
    const setup = toSetup(draft, (i) => `J${i + 1}`);
    expect(setup.participants[0]).toMatchObject({
      kind: "user",
      name: "Borja",
      userId: "uid-1",
      deckName: "Vampiros",
    });
  });

  it("editar el nombre degrada el asiento «Yo» a invitado", () => {
    const draft = assignSelf(newDraft("commander"), 0, { userId: "uid-1", name: "Borja" });
    const edited = updatePlayer(draft, 0, { name: "Otro" });
    expect(edited.players[0].userId).toBeUndefined();
    expect(toSetup(edited, (i) => `J${i + 1}`).participants[0].kind).toBe("guest");
  });

  it("userId y playerId son excluyentes: asignar uno limpia el otro", () => {
    const asSelf = assignSelf(
      assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" }),
      0,
      { userId: "uid-1", name: "Borja" },
    );
    expect(asSelf.players[0]).toMatchObject({ userId: "uid-1" });
    expect(asSelf.players[0].playerId).toBeUndefined();

    const backToRegular = assignRegular(asSelf, 0, { playerId: "j1", name: "Pablo" });
    expect(backToRegular.players[0]).toMatchObject({ playerId: "j1" });
    expect(backToRegular.players[0].userId).toBeUndefined();
  });

  it("draftFromSetup conserva userId de los user (mesa recordada)", () => {
    const setup = toSetup(assignSelf(newDraft("commander"), 0, { userId: "uid-1", name: "Borja" }), (i) => `J${i + 1}`);
    expect(draftFromSetup(setup).players[0].userId).toBe("uid-1");
  });
});
