// src/components/detail/work-scope-contrast.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Lee el CSS REAL: copiar aquí los valores dejaría que el test y el color divergieran.
const css = readFileSync(join(__dirname, "work-scope.module.css"), "utf8");

function block(selector: string) {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}
function tokens(text: string) {
  const out: Record<string, [number, number]> = {};
  for (const m of text.matchAll(/(--[\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+var\(--work-hue\)\)/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return out;
}

function linearRgb(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function srgbLuminance(L: number, C: number, H: number) {
  return luminance(linearRgb(L, C, H));
}
function ratio(a: [number, number], b: [number, number], h: number) {
  const x = srgbLuminance(a[0], a[1], h), y = srgbLuminance(b[0], b[1], h);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT = ["--foreground", "--foreground-soft", "--muted-foreground", "--work-title", "--accent-ink"];
const SURFACES = ["--background", "--surface", "--surface-muted"];

describe("títulos de sección", () => {
  it("la regla de h2 excluye los de dentro de un <dialog>", () => {
    expect(css).toContain('[role="tabpanel"] h2:not(dialog h2)');
  });
  it("los rótulos que no son h2 se suman con data-section-title y la cabecera de episodios queda fuera", () => {
    expect(css).toContain('[role="tabpanel"] [data-section-title]');
    expect(css).toContain(":not([data-plain-title])");
  });
});

describe("espejo del tema oscuro del sistema", () => {
  it("el bloque @media (prefers-color-scheme: dark) iguala al de .dark", () => {
    const media = tokens(block(":global(:root:not(.light):not(.dark)) .scope {"));
    expect(Object.keys(media).length).toBeGreaterThan(0);
    expect(media).toEqual(tokens(block(":global(.dark) .scope {")));
  });
  it("excluye .light explícito", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(":not(.light):not(.dark)");
  });
});

describe.each([
  ["claro", tokens(block(".scope {"))],
  ["oscuro", tokens(block(":global(.dark) .scope {"))],
])("tema %s", (_name, t) => {
  it("define todos los tokens", () => {
    for (const k of [...TEXT, ...SURFACES, "--accent", "--accent-foreground"]) expect(t[k], k).toBeDefined();
  });
  it("texto sobre superficies: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const fg of TEXT) for (const bg of SURFACES) {
      expect(ratio(t[fg], t[bg], h), `${fg} sobre ${bg} en ${h}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("texto sobre el acento: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) {
      expect(ratio(t["--accent-foreground"], t["--accent"], h), `acento en ${h}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ── Color de tipo dentro de la ficha (spec 2026-11-11-ficha-con-gesto) ──────
const globalsCss = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
const KINDS = ["book", "movie", "series"] as const;

function aliases(text: string) {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--type-[\w-]+):\s*var\((--[\w-]+)\)/g)) out[m[1]] = m[2];
  return out;
}
function hexes(text: string) {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--type-[\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}
/** Los valores de `--type-*` de globals.css, por orden de aparición: claro, .dark, sistema oscuro. */
function globalTypeColors(index: number) {
  const out: Record<string, string> = {};
  for (const kind of KINDS) for (const suffix of ["", "-ink"]) {
    const name = `--type-${kind}${suffix}`;
    const found = [...globalsCss.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi"))];
    expect(found.length, name).toBeGreaterThanOrEqual(3);
    out[name] = found[index][1].toLowerCase();
  }
  return out;
}
// El tinte `bg-type-*/10` es el color al 10 % de alfa: el navegador lo compone
// sobre el fondo en sRGB con gamma, no en lineal.
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function ratioOverTint(text: [number, number], tint: [number, number], bg: [number, number], h: number) {
  const top = linearRgb(tint[0], tint[1], h).map(encode);
  const under = linearRgb(bg[0], bg[1], h).map(encode);
  const mixed = top.map((v, i) => decode(v * 0.1 + under[i] * 0.9)) as [number, number, number];
  const x = srgbLuminance(text[0], text[1], h), y = luminance(mixed);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const EXPECTED_ALIASES = {
  "--type-book": "--accent", "--type-movie": "--accent", "--type-series": "--accent",
  "--type-book-ink": "--accent-ink", "--type-movie-ink": "--accent-ink", "--type-series-ink": "--accent-ink",
};

describe.each([
  ["claro", ".scope {", ".scope :global(dialog) {", 0],
  ["oscuro", ":global(.dark) .scope {", ":global(.dark) .scope :global(dialog) {", 1],
  ["sistema oscuro", ":global(:root:not(.light):not(.dark)) .scope {", ":global(:root:not(.light):not(.dark)) .scope :global(dialog) {", 2],
] as const)("color de tipo en la ficha, tema %s", (_name, scopeSelector, dialogSelector, globalsIndex) => {
  const t = tokens(block(scopeSelector));

  it("el color de tipo es el acento de la obra", () => {
    expect(aliases(block(scopeSelector))).toEqual(EXPECTED_ALIASES);
  });
  it("las hojas <dialog> recuperan los colores de tipo de globals.css", () => {
    expect(hexes(block(dialogSelector))).toEqual(globalTypeColors(globalsIndex));
  });
  it("como gráfico: 3:1 sobre fondo y tarjeta en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const bg of ["--background", "--surface"]) {
      expect(ratio(t["--accent"], t[bg], h), `--accent sobre ${bg} en ${h}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("como texto sobre su tinte al 10 %: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const bg of ["--background", "--surface"]) {
      expect(
        ratioOverTint(t["--accent-ink"], t["--accent"], t[bg], h),
        `--accent-ink sobre tinte en ${bg}, tono ${h}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
