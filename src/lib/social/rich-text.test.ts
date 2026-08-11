import { describe, it, expect } from "vitest";
import { parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("parsea negrita, cursiva, mención y viñeta", () => {
    const [l0] = parseRichText("- hola **mundo** *ok* @borja");
    expect(l0.isList).toBe(true);
    expect(l0.segments).toEqual([
      { kind: "plain", text: "hola " },
      { kind: "bold", text: "mundo" },
      { kind: "plain", text: " " },
      { kind: "italic", text: "ok" },
      { kind: "plain", text: " " },
      { kind: "mention", text: "@borja" },
    ]);
  });

  it("token sin cerrar queda plano", () => {
    expect(parseRichText("**a")).toEqual([
      { isList: false, segments: [{ kind: "plain", text: "**a" }] },
    ]);
  });

  it("línea vacía produce un segmento plano vacío", () => {
    expect(parseRichText("")).toEqual([
      { isList: false, segments: [{ kind: "plain", text: "" }] },
    ]);
  });

  it("varias líneas se parsean por separado", () => {
    const lines = parseRichText("hola\n- item uno\nadiós");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ isList: false, segments: [{ kind: "plain", text: "hola" }] });
    expect(lines[1]).toEqual({ isList: true, segments: [{ kind: "plain", text: "item uno" }] });
    expect(lines[2]).toEqual({ isList: false, segments: [{ kind: "plain", text: "adiós" }] });
  });

  it("una línea solo con texto plano no genera segmentos vacíos extra", () => {
    expect(parseRichText("sin formato")).toEqual([
      { isList: false, segments: [{ kind: "plain", text: "sin formato" }] },
    ]);
  });

  it("negrita y cursiva pegadas sin espacio", () => {
    expect(parseRichText("**bold***italic*")).toEqual([
      {
        isList: false,
        segments: [
          { kind: "bold", text: "bold" },
          { kind: "italic", text: "italic" },
        ],
      },
    ]);
  });
});
