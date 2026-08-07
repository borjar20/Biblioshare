import { describe, expect, it } from "vitest";
import { reactionMeta } from "./reaction-bar";
import { REACTION_KINDS } from "@/lib/social/interactions";

// No hay runner de componentes (.test.tsx) en el repo -- degradado documentado
// en la Tarea 1.5: se testea el helper puro que decide emoji/label por kind;
// el pintado real (clicks, aria-pressed) lo verifica el e2e de Fase 6.
describe("reactionMeta", () => {
  it("da emoji y label para cada kind de la paleta", () => {
    expect(reactionMeta("like")).toEqual({ emoji: "♡", label: "Me gusta" });
    expect(reactionMeta("read")).toEqual({ emoji: "📖", label: "Leído" });
    expect(reactionMeta("shock")).toEqual({ emoji: "😱", label: "Impacto" });
    expect(reactionMeta("fire")).toEqual({ emoji: "🔥", label: "Fuego" });
  });

  it("cubre las 4 kinds de la paleta, ni una menos", () => {
    for (const k of REACTION_KINDS) {
      const meta = reactionMeta(k);
      expect(meta.emoji).toBeTruthy();
      expect(meta.label).toBeTruthy();
    }
  });
});
