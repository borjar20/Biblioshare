import { describe, expect, it } from "vitest";
import {
  EMOJI_CATALOG,
  EMOJI_GROUPS,
  emojiName,
  emojisByGroup,
  isAllowedEmoji,
  searchEmojis,
} from "./emoji-catalog";
import { QUICK_REACTIONS, QUICK_REACTION_NAMES } from "./reaction-constants";

describe("catálogo de emojis", () => {
  it("tiene volumen razonable y ninguna entrada rota", () => {
    expect(EMOJI_CATALOG.length).toBeGreaterThan(1500);
    for (const entry of EMOJI_CATALOG) {
      expect(entry.e.length).toBeGreaterThan(0);
      expect(entry.n.length).toBeGreaterThan(0);
      expect(entry.g).toBeGreaterThanOrEqual(0);
      expect(entry.g).toBeLessThan(EMOJI_GROUPS.length);
    }
  });

  it("no repite emojis", () => {
    const chars = new Set(EMOJI_CATALOG.map((entry) => entry.e));
    expect(chars.size).toBe(EMOJI_CATALOG.length);
  });

  it("todos los grupos tienen contenido", () => {
    for (const group of EMOJI_GROUPS) {
      expect(emojisByGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  // Esta es la prueba que detecta una regeneración rota: si Unicode reorganiza
  // grupos o CLDR renombra, lo que se cae primero es la fila rápida.
  it("la fila rápida y los 4 emojis migrados existen en el catálogo", () => {
    for (const emoji of QUICK_REACTIONS) expect(isAllowedEmoji(emoji)).toBe(true);
    for (const emoji of ["❤️", "📖", "😱", "🔥"]) expect(isAllowedEmoji(emoji)).toBe(true);
  });

  it("los nombres duplicados en reaction-constants siguen coincidiendo", () => {
    for (const emoji of QUICK_REACTIONS) {
      expect(QUICK_REACTION_NAMES[emoji]).toBe(emojiName(emoji));
    }
  });
});

describe("isAllowedEmoji", () => {
  it("acepta emojis del catálogo, incluidos secuencias ZWJ y keycaps", () => {
    expect(isAllowedEmoji("❤️")).toBe(true);
    expect(isAllowedEmoji("👨‍👩‍👧")).toBe(true);
    expect(isAllowedEmoji("1️⃣")).toBe(true);
  });

  it("rechaza texto, vacío, dobles y cualquier cosa que no sea string", () => {
    expect(isAllowedEmoji("like")).toBe(false);
    expect(isAllowedEmoji("a")).toBe(false);
    expect(isAllowedEmoji("")).toBe(false);
    expect(isAllowedEmoji("🔥🔥")).toBe(false);
    expect(isAllowedEmoji("<script>")).toBe(false);
    expect(isAllowedEmoji(null)).toBe(false);
    expect(isAllowedEmoji(42)).toBe(false);
  });
});

describe("searchEmojis", () => {
  it("encuentra por nombre exacto y lo pone primero", () => {
    expect(searchEmojis("fuego")[0].e).toBe("🔥");
  });

  it("ignora tildes y mayúsculas", () => {
    const sinTilde = searchEmojis("corazon").map((entry) => entry.e);
    expect(sinTilde).toContain("❤️");
    expect(searchEmojis("FUEGO")[0].e).toBe("🔥");
  });

  it("devuelve vacío con consulta vacía y respeta el límite", () => {
    expect(searchEmojis("")).toEqual([]);
    expect(searchEmojis("   ")).toEqual([]);
    expect(searchEmojis("a", 10).length).toBeLessThanOrEqual(10);
    expect(searchEmojis("a").length).toBeLessThanOrEqual(100);
  });
});
