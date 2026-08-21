import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// La cabecera de `revalidate.ts` dice desde el primer día que «toda server
// action revalida a través de estos helpers en vez de llamar a revalidatePath
// suelto». Era un comentario, no una regla: la auditoría 2026-08 encontró
// nueve llamadas sueltas repartidas por seis ficheros (F1-030), y el modo de
// fallo no es que la app se rompa —hoy no se nota, porque Next todavía refresca
// al NAVEGAR cualquier página ya visitada— sino que el día que retiren ese
// refresco temporal aparezcan a la vez varias pantallas rancias sin que nadie
// haya tocado nada.
//
// Este test convierte el comentario en una regla que se puede romper una sola
// vez: en rojo, y con el nombre del fichero.
//
// El bloqueo es sobre `revalidatePath` y no sobre `updateTag`/`revalidateTag`
// a propósito. Las etiquetas se declaran en el mismo fichero que las lee
// (`cacheTag` junto a su `use cache`), así que quien las invalida tiene el
// contrato delante; una ruta, en cambio, se revalida a ciegas desde cualquier
// sitio y nadie ve la lista completa de las que hacían falta. Ese es justo el
// error que el módulo central existe para hacer imposible.

const SRC = join(process.cwd(), "src");

// El propio módulo (y su test) son los únicos que pueden llamarlo a pelo.
const PERMITIDOS = new Set([
  join("lib", "reactivity", "revalidate.ts"),
  join("lib", "reactivity", "revalidate.test.ts"),
  join("lib", "reactivity", "revalidate-guard.test.ts"),
]);

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      salida.push(...ficherosDeCodigo(ruta));
    } else if (/\.tsx?$/.test(entrada.name)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("el módulo central de revalidación es el único camino (F1-030)", () => {
  it("nadie fuera de revalidate.ts llama a revalidatePath a pelo", () => {
    const infractores: string[] = [];

    for (const fichero of ficherosDeCodigo(SRC)) {
      const relativo = relative(SRC, fichero);
      if (PERMITIDOS.has(relativo)) continue;

      const contenido = readFileSync(fichero, "utf8");
      // Solo la LLAMADA. Nombrarlo en un comentario —explicando por qué NO se
      // usa, que es justo lo que hace `notification-actions.ts`— vale.
      if (/^[^/*\n]*\brevalidatePath\s*\(/m.test(contenido)) {
        infractores.push(relativo.split(sep).join("/"));
      }
    }

    expect(infractores).toEqual([]);
  });
});
