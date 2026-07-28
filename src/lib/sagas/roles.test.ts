import { describe, expect, it } from "vitest";
import es from "../../../messages/es.json";
import { Constants } from "../supabase/database.types";
import { SAGA_ITEM_ROLES } from "./roles";

// Este fichero existe porque el vocabulario de roles estaba escrito TRES veces
// —la unión de `types.ts` y dos arrays `ROLES` idénticos en el editor de
// secuencia— sin nada que obligara a que coincidieran. Ahora hay una sola
// lista, y estos dos tests son lo que la ata a la BD y a las traducciones.
describe("SAGA_ITEM_ROLES", () => {
  it("es exactamente el enum saga_item_role de la BD", () => {
    // `Constants` sale de database.types.ts, el espejo GENERADO de la BD: si
    // alguien amplía el enum en Postgres y no aquí (o al revés), cae este test
    // y no un cast en producción. Se comparan ORDENADOS a propósito: el orden
    // de `roles.ts` es el de lectura y el del enum es el histórico
    // (`enumsortorder`), y que difieran no es un error.
    expect([...SAGA_ITEM_ROLES].sort()).toEqual([...Constants.public.Enums.saga_item_role].sort());
  });

  it("cada rol tiene etiqueta larga, corta y de editor en es.json", () => {
    // RoleChip no tiene caso por defecto A PROPÓSITO (role-chip.tsx): un rol
    // sin traducción debe verse raro en dev, no esconderse tras un genérico.
    // Este test es lo que convierte «verse raro» en «test rojo».
    for (const role of SAGA_ITEM_ROLES) {
      expect(es.saga.roleLabel, `roleLabel.${role}`).toHaveProperty(role);
      expect(es.saga.roleShort, `roleShort.${role}`).toHaveProperty(role);
      expect(es.sagaEditor.role, `sagaEditor.role.${role}`).toHaveProperty(role);
    }
  });
});
