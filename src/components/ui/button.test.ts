import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

// Tailwind resuelve conflictos por orden de hoja, no por orden en el string:
// sin quitar la clase base, `hidden`/`px-3` del llamante perdían contra el
// `inline-flex`/`px-5` de aquí (botones de auth de la topbar en móvil).
describe("buttonVariants", () => {
  it("quita de la base la clase que el llamante redefine", () => {
    const tokens = buttonVariants("ghost", "hidden px-3 py-1.5 sm:inline-flex").split(" ");
    expect(tokens).not.toContain("inline-flex");
    expect(tokens).not.toContain("px-5");
    expect(tokens).not.toContain("py-2");
    expect(tokens).toContain("hidden");
    expect(tokens).toContain("px-3");
    expect(tokens).toContain("sm:inline-flex");
  });

  it("no toca la base cuando el llamante solo redefine con variante", () => {
    // `sm:px-8` no debe dejar el móvil sin padding.
    expect(buttonVariants("primary", "sm:px-8")).toMatch(/\bpx-5\b/);
  });

  it("mantiene la base cuando no hay conflicto", () => {
    const cls = buttonVariants("primary", "w-full");
    expect(cls).toMatch(/\bpx-5\b/);
    expect(cls).toMatch(/\binline-flex\b/);
    expect(cls).toMatch(/\bbg-accent\b/);
  });
});
