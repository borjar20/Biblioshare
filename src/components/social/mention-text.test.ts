import { describe, it, expect } from "vitest";
import { tokenizeMentions } from "./mention-text";

// @testing-library/react no está cableado (sin jsdom en el proyecto): en vez
// de renderizar <MentionText/>, se prueba la función pura que decide la
// segmentación. MentionText es una capa fina encima (mapea "mention" a
// <Link>, "text" al string tal cual).
describe("tokenizeMentions", () => {
  it("linkifica un username conocido", () => {
    expect(tokenizeMentions("hola @borja", ["borja"])).toEqual([
      { type: "text", value: "hola " },
      { type: "mention", value: "borja" },
    ]);
  });

  it("deja como texto plano un username desconocido (sin enlace muerto)", () => {
    expect(tokenizeMentions("hola @nadie", [])).toEqual([
      { type: "text", value: "hola @nadie" },
    ]);
  });

  it("preserva el texto alrededor de la mención", () => {
    const segments = tokenizeMentions("a @borja b", ["borja"]);
    // value de un segmento "mention" es el username pelado (sin "@"): el "@"
    // lo añade MentionText al renderizar (`@{s.value}`), igual que hacía el
    // sketch del Step 3 del brief.
    const reconstructed = segments
      .map((s) => (s.type === "mention" ? `@${s.value}` : s.value))
      .join("");
    expect(reconstructed).toBe("a @borja b");
    expect(segments).toEqual([
      { type: "text", value: "a " },
      { type: "mention", value: "borja" },
      { type: "text", value: " b" },
    ]);
  });

  it("soporta varias menciones, mezclando conocidas y desconocidas", () => {
    expect(tokenizeMentions("hola @borja y @nadie", ["borja"])).toEqual([
      { type: "text", value: "hola " },
      { type: "mention", value: "borja" },
      { type: "text", value: " y @nadie" },
    ]);
  });

  it("es case-insensitive contra la lista de conocidos", () => {
    expect(tokenizeMentions("hola @Borja", ["borja"])).toEqual([
      { type: "text", value: "hola " },
      { type: "mention", value: "Borja" },
    ]);
  });

  it("texto vacío produce sin segmentos (o un único segmento vacío)", () => {
    expect(tokenizeMentions("", ["borja"])).toEqual([]);
  });

  it("texto sin menciones es un único segmento de texto", () => {
    expect(tokenizeMentions("sin menciones aquí", ["borja"])).toEqual([
      { type: "text", value: "sin menciones aquí" },
    ]);
  });
});
