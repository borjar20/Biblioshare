import { describe, expect, it } from "vitest";
import { ROLE_GLYPH } from "./role-style";
import { SAGA_ITEM_ROLES } from "./roles";

describe("ROLE_GLYPH", () => {
  it("cubre todos los roles y ninguno de más", () => {
    // El `Record<SagaItemRole, string>` ya lo exige en compilación; esto lo
    // exige también en ejecución, que es lo que queda cuando alguien amplía el
    // enum y silencia el error con un `as`.
    expect(Object.keys(ROLE_GLYPH).sort()).toEqual([...SAGA_ITEM_ROLES].sort());
  });

  it("los glifos son distintos entre sí", () => {
    // Un glifo repetido no rompe nada, pero deja de distinguir — que es lo
    // único para lo que existe: el rol no estrena paleta porque el color ya
    // significa subsaga en este producto.
    const glifos = Object.values(ROLE_GLYPH);
    expect(new Set(glifos).size).toBe(glifos.length);
  });
});
