import { describe, it, expect } from "vitest";
import { findActiveMentionToken } from "./use-mention-autocomplete";

describe("findActiveMentionToken", () => {
  it("detecta un token @ bajo el cursor", () => {
    const text = "hola @bor";
    expect(findActiveMentionToken(text, text.length)).toEqual({ query: "bor", start: 5 });
  });
  it("no detecta si el @ es de un email", () => {
    const text = "foo@bar";
    expect(findActiveMentionToken(text, text.length)).toBeNull();
  });
  it("cierra el token al llegar un espacio", () => {
    const text = "@bor ya";
    expect(findActiveMentionToken(text, text.length)).toBeNull();
  });
  it("detecta @ al inicio", () => {
    expect(findActiveMentionToken("@a", 2)).toEqual({ query: "a", start: 0 });
  });
  it("usa la posición del cursor, no el final", () => {
    const text = "@borja hola";
    expect(findActiveMentionToken(text, 4)).toEqual({ query: "bor", start: 0 });
  });
});
