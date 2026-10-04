# Fixture de ronda: respuestas REST y limpieza (#405)

> **[Candidato · verificado contra código, nueve contratos Node, TypeScript y ESLint focal el 2026-10-04; navegador/dev y CI remota no ejecutados en esta fase]**

Un POST rechazado de `club_members` ya corta la preparación antes de abrir
`/login`, con un error que identifica `POST club_members: HTTP <status>`.
Antes se descartaba la respuesta y se llegaba al composer con un roster vacío:
el síntoma posterior era un timeout de UI que no identificaba el fixture.

`e2e/club-ronda.spec.ts` usa `withClubRoundFixture` de
`e2e/support/club-round-fixture.ts` para crear su club, insertar la membresía,
ejecutar su recorrido y borrar el club por su id exacto. Los dos POST y el
DELETE comprueban `response.ok`. El DELETE 204 no intenta leer JSON. Si también
falló la preparación o la prueba, la limpieza genera un `AggregateError` que
conserva ambos errores en orden y el primero como `cause`; los errores HTTP
identifican método, recurso y código sin imprimir cabeceras ni cuerpos de
respuesta. Un error de transporte conserva su identidad original.

El dueño se resuelve desde la cuenta QA persistente existente. El helper no
crea ni borra usuarios Auth, ni modifica su biblioteca. Sólo borra el club
desechable una vez recibido su id; su cascade elimina membresía y rondas.
El cuerpo del recorrido de UI permanece igual.

## Reproducción y cobertura durable

`e2e/support/club-round-fixture.test.ts` compila el spec real, registra su
callback Playwright y lo ejecuta con fetch y primer punto de entrada al
navegador controlados. No prueba únicamente un helper aislado: también falla
si el spec lo evita y alcanza `/login` tras un 403. El punto de UI positivo
detiene deliberadamente el recorrido al entrar en el login; acredita la
llamada y el orden del caller real, no el DOM ni una sesión autenticada.

Los siete casos iniciales corrieron **antes del arreglo**: dos PASS y cinco
FAIL, en 659 ms. El negativo de membresía observó `loginReached=true`; el
DELETE 500 no informaba su fallo. Estos FAIL se conservaron sin sobrescribirlos.
Tras el arreglo, los siete pasaron. Se añadieron dos casos de cuerpo exitoso
para verificar devolución del resultado y fallo de limpieza sin causa previa.
La tanda final acredita **9 PASS / 0 FAIL / 0 SKIPPED**, en 702 ms.

| Caso | Resultado exigido |
|---|---|
| Membresía 403, cleanup 204 | No llega al login; error HTTP localizado; cleanup del club exacto |
| Membresía 201, checkpoint de UI fallido, cleanup 204 | Llega al login real del callback; conserva el error del checkpoint |
| Checkpoint de UI fallido y cleanup 500 | Ambas causas, con el fallo de UI primero |
| Membresía 403 y cleanup 500 | No llega al login; conserva ambos códigos HTTP |
| Creación del club 403 | Error HTTP antes del parseo/shape, membresía o UI; sin id que limpiar |
| Transporte de membresía rechazado | No llega al login; misma causa; limpia el club |
| Membresía 403 y transporte de cleanup rechazado | Ambas causas, incluyendo la identidad del error de transporte |
| Cuerpo exitoso y cleanup 204 | Devuelve el resultado tras limpiar, sin parsear una respuesta vacía |
| Cuerpo exitoso y cleanup 500 | Falla por el HTTP del DELETE, sin inventar un error previo |

Comando focal, con Node admitido por `package.json`:

```sh
node --import tsx --test e2e/support/club-round-fixture.test.ts
```

La ejecución local usó Node **24.19.0**, suministrado por el runtime del host;
el Node 23 del shell no cumple `engines` y no se utilizó para estos checks.
No se cambió ninguna dependencia.

El job `quality` de `.github/workflows/tests.yml` ejecuta este comando como
paso propio después de Vitest. Esto es necesario: Vitest sólo descubre tests
en `src`, y el Playwright principal excluye `e2e/support`. El job de navegador
usa `playwright.ci.config.ts` con `testDir: e2e/ci`; este spec de ronda no forma
parte de esa tanda. Por tanto, el nuevo paso acredita sus contratos de fixture
en CI, sin afirmar que CI ejecute su recorrido completo de navegador.

## Checks y límites

- Contratos Node: **9/9 PASS**; RED previo causal **5 FAIL / 2 PASS** conservado.
- TypeScript completo, `tsc --noEmit --incremental false`: **PASS**.
- ESLint de spec, helper y test: **PASS**.
- Comprobación de espacios del diff y conservación del cuerpo de UI: **PASS**.
- Base de datos, Auth real, navegador y CI remota: **NO EJECUTADOS** en esta fase.

Evidencia local de campaña:
`.scratch/ticket-campaign/20261002-resolve-all/club-round-fixture405-20261004-implementation-r1/`
en el checkout principal. Incluye fuentes RED congeladas, `red-01.log/json`,
`green-01.log/json`, `green-02.log/json`, logs de tipos/lint y el sello final
con hashes de los seis ficheros del candidato. El exit code cero del script
que guarda el RED no convierte ese resultado en PASS: `red-01.json` conserva
el exit code **1** del test.

Este cambio no cubre #401: no toca reloj, SQL, concurrencia ni runner de base
de datos. `docs/TESTING.md` enlaza este informe y distingue el contrato Node de
una ejecución de navegador. El cierre/publicación de #405 corresponde al
coordinador tras revisión e integración.
