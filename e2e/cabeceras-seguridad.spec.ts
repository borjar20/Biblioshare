import { test, expect } from "@playwright/test";

// Auditoría 2026-08, hallazgo S2-08: la app se servía sin NINGUNA cabecera de
// seguridad. Lo que este spec defiende no es la configuración, es la propiedad:
// que la respuesta HTML real llegue con la app no enmarcable y sin sniffing de
// tipo. `next.config.ts` es fácil de tocar sin darse cuenta (el bloque
// `headers()` convive con imágenes y Cache Components) y una regresión aquí no
// se ve en pantalla.
//
// No pide login a propósito: /login es una ruta pública y las cabeceras son
// globales, así que este spec sigue verde aunque no haya cuenta de pruebas.
const ESPERADAS: Record<string, string | RegExp> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": /max-age=\d{7,}/,
  "content-security-policy": /frame-ancestors 'none'/,
};

test("el HTML se sirve con las cabeceras de seguridad", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.status()).toBe(200);

  const headers = res.headers();
  for (const [name, esperado] of Object.entries(ESPERADAS)) {
    const valor = headers[name];
    expect(valor, `falta la cabecera ${name}`).toBeDefined();
    if (typeof esperado === "string") expect(valor).toBe(esperado);
    else expect(valor).toMatch(esperado);
  }

  // Las otras tres directivas de la CSP parcial. Se comprueban sueltas para que
  // el fallo diga CUÁL se cayó, no «la cadena no coincide».
  const csp = headers["content-security-policy"];
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("form-action 'self'");
});
