// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cycleVoiceRate, isListened, markListened, readVoiceRate } from "./voice-preferences";

beforeEach(() => localStorage.clear());

describe("velocidad", () => {
  it("por defecto 1x", () => {
    expect(readVoiceRate()).toBe(1);
  });
  it("cicla 1 → 1.5 → 2 → 1 y persiste", () => {
    expect(cycleVoiceRate()).toBe(1.5);
    expect(cycleVoiceRate()).toBe(2);
    expect(cycleVoiceRate()).toBe(1);
    expect(readVoiceRate()).toBe(1);
  });
  it("valor corrupto en storage → 1x", () => {
    localStorage.setItem("biblioshare:voice-rate", "banana");
    expect(readVoiceRate()).toBe(1);
  });
});

describe("escuchado", () => {
  it("marca y recuerda por id", () => {
    expect(isListened("c1")).toBe(false);
    markListened("c1");
    expect(isListened("c1")).toBe(true);
    expect(isListened("c2")).toBe(false);
  });
  it("recorta a 500 ids", () => {
    for (let i = 0; i < 510; i++) markListened(`c${i}`);
    expect(isListened("c0")).toBe(false);
    expect(isListened("c509")).toBe(true);
  });
});
