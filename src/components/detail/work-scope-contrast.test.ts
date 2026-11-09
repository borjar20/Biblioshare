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

function srgbLuminance(L: number, C: number, H: number) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
function ratio(a: [number, number], b: [number, number], h: number) {
  const x = srgbLuminance(a[0], a[1], h), y = srgbLuminance(b[0], b[1], h);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT = ["--foreground", "--foreground-soft", "--muted-foreground", "--work-title", "--accent-ink"];
const SURFACES = ["--background", "--surface", "--surface-muted"];

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
