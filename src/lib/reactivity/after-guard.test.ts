import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// `after()` corre DESPUÉS del ciclo de render de React, así que dentro de su
// callback ya no hay petición: leer `cookies()` o `headers()` ahí lanza. Lo dice
// la doc de Next con todas las letras
// (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`,
// §«In Server Components»): «Server Components (including pages, layouts, and
// `generateMetadata`) **cannot** use `cookies`, `headers`, or other Request-time
// APIs inside `after`».
//
// La trampa —y el bug que este test existe para no repetir (#751)— es que casi
// nadie escribe `cookies()` ahí dentro a la vista. Lo que se cuela es el CLIENTE
// de Supabase de la petición: `createClient()` resuelve `await cookies()` al
// construirse, pero le pasa al cliente un adaptador que llama a
// `cookieStore.getAll()` en CADA consulta. Pasar ese cliente al callback por
// closure es, en la práctica, llamar a `cookies()` dentro del `after()` — solo
// que en diferido y sin que se vea leyendo el código.
//
// Y no se nota: en las tres fichas el error se lo tragaba el `try/catch` de
// `ensure*Hydrated` (que existe para que un fallo de API externa no tumbe la
// ficha, contrato correcto), así que la hidratación perezosa llevaba semanas sin
// correr NUNCA en producción sin romper una sola página ni un solo test.
// Tampoco lo enseña `next dev`: solo el build de producción.
//
// ALCANCE, y es a propósito: solo Server Components. En Route Handlers la doc
// enseña el caso contrario como ejemplo VÁLIDO (leer `headers()` dentro del
// `after` de un `POST`), y de las Server Actions no dice nada. Un guard que
// prohibiera ahí estaría inventándose una regla; ver #753 para la sospecha
// abierta sobre `buscar/actions.ts`.

const SRC = join(process.cwd(), "src");

// Lo que NO puede aparecer dentro de un callback de `after()` en un Server
// Component. `supabase` es el nombre convenido en todo el repo para el cliente
// de la petición; `createClient`, `getCurrentUser` y `getAccessToken` lo
// construyen por dentro.
//
// `createTokenClient`, `createServiceRoleClient` y `createPublicClient` NO
// entran, y no es un olvido: ninguno toca cookies —el primero recibe el token
// ya leído como argumento— y son justamente la salida a este problema.
const PROHIBIDO = [
  /\bsupabase\b/,
  /\bcreateClient\s*\(/,
  /\bgetCurrentUser\s*\(/,
  /\bgetAccessToken\s*\(/,
  /\bcookies\s*\(/,
  /\bheaders\s*\(/,
];

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficherosDeCodigo(ruta));
    else if (/\.tsx?$/.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

// Un fichero es Server Component si es una página o un layout del router, o si
// exporta `generateMetadata` (la doc los nombra juntos). Los que declaran
// "use client" o "use server" quedan fuera por definición.
function esServerComponent(relativo: string, contenido: string): boolean {
  if (/^\s*["']use (client|server)["']/m.test(contenido)) return false;
  const nombre = relativo.split(sep).pop() ?? "";
  if (/^(page|layout|default|template)\.tsx?$/.test(nombre)) return true;
  return /export\s+(async\s+)?function\s+generateMetadata\b/.test(contenido);
}

// El texto entre los paréntesis de cada `after(`, contando anidados. Con regex
// sola no vale: los callbacks traen objetos, llamadas y paréntesis dentro.
function callbacksDeAfter(contenido: string): string[] {
  const salida: string[] = [];
  const inicio = /(^|[^.\w])after\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(contenido)) !== null) {
    let profundidad = 1;
    let i = m.index + m[0].length;
    while (i < contenido.length && profundidad > 0) {
      if (contenido[i] === "(") profundidad++;
      else if (contenido[i] === ")") profundidad--;
      i++;
    }
    salida.push(contenido.slice(m.index + m[0].length, i - 1));
  }
  return salida;
}

describe("nadie mete la petición dentro de after() (#751)", () => {
  it("ningún Server Component usa el cliente de la petición en un after()", () => {
    const infractores: string[] = [];

    for (const fichero of ficherosDeCodigo(SRC)) {
      const relativo = relative(SRC, fichero);
      if (relativo.includes(".test.")) continue;

      const contenido = readFileSync(fichero, "utf8");
      if (!esServerComponent(relativo, contenido)) continue;

      for (const callback of callbacksDeAfter(contenido)) {
        // Un cliente que el propio callback se construye dentro es legal: es
        // exactamente el arreglo (`createServiceRoleClient()` no toca cookies).
        if (/\bconst\s+supabase\s*=/.test(callback)) continue;
        const prohibido = PROHIBIDO.find((patron) => patron.test(callback));
        if (prohibido) {
          infractores.push(`${relativo.split(sep).join("/")} → ${prohibido.source}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});
