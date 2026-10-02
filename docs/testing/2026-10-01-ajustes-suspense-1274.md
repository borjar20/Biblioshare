# Ajustes: frontera de carga — #1274

> **[Canónico · verificación acotada el 2026-10-01]**

## Resultado

**PASS del alcance de #1274.** El baseline con localhost y una cuenta con
onboarding completo renderizaba Ajustes y permitía ocultar/mostrar la compañera,
pero registraba dos `blocking-prerender-dynamic` al llamar a
`createClient()` → `connection()` en la página, sin una frontera propia.
El error no demostraba que el toggle estuviera roto.

Se añade `src/app/ajustes/loading.tsx`: Next coloca su fallback estático en
una frontera Suspense bajo el layout y envuelve la página. Se retiran los
`instant = false` de página y layout. Las consultas, autorización y RLS
permanecen en la página; el shell no contiene datos de cuenta ni nueva caché.
El provider de traducciones de la sección se conserva.

## Comprobaciones finales

Código sobre `f0aba65cfe97a3e93bba2a208e7dcdcb8fd925da`, más los tres archivos
de Ajustes identificados por sus hashes abajo. Windows, Node 24.19.0 para
Next y Playwright, Next 16.3.8, Playwright 1.61.1, Chromium y Supabase local.
App en `http://localhost:3000`; Supabase limitado a `127.0.0.1`.

| Comprobación | Resultado | Pruebas | Duración Playwright | Errores de prerender de Ajustes |
|---|---|---:|---:|---:|
| `next dev`, variante final | PASS | 6 | 31,33 s | 0 |
| `next build`, variante final | PASS | — | — | 0 en el log |
| `next start`, variante final | PASS | 6 | 12,89 s | 0 |
| ESLint, tres archivos de Ajustes | PASS | — | — | — |
| `tsc --noEmit` | PASS | — | — | — |

Build probado: `4cR4Zx7nNc0GGPKQoI3CV`. El anterior se apartó dentro de
`.scratch/ticket-campaign/qa1274/`; no se confundieron ambos binarios.
La validación `instant` de navegación es de dev en esta versión de Next;
build/start se comprueban por separado.

Los seis recorridos seleccionados verifican:

- Anónimo en Ajustes: login con `next=/ajustes`.
- Identidad de la cuenta autenticada, toggle presente y ausencia de overflow
  horizontal a 390 y 1440 px; capturas inspeccionadas.
- Visor de administrador: 19 sprites, escala 3×, pausa y replay.
- Eclosión, compañera en el shell y ausencia en la pantalla del juego.
- Ocultar/mostrar la compañera desde Ajustes.
- Ausencia de compañera sin sesión.

En cada lote hubo seis PASS, cero FAIL, cero SKIPPED, cero flaky y ningún
reintento. El test de redirección de administrador de #1271 se excluyó de
la selección; estas cifras no afirman que todo `admin-mascota.spec.ts` pase.
Las cuentas temporales propias tenían perfil con `onboarded_at` y mascota.
Al terminar, Auth respondió 404 y `profiles`, `pet_state`, `passes`,
`pet_acorn_ledger` y `pet_cosmetics` tenían cero filas para cada actor.
El puerto 3000 quedó libre. No se usaron cuentas ni datos productivos.

## Evidencia y límites

Directorio local ignorado: `.scratch/ticket-campaign/qa1274/`.

| Artefacto | SHA-256 |
|---|---|
| Baseline válido, `qa1073/paired-onboarded-1790854158407/server-and-test.log` | `7C2A27CE4A2D0A120D0CD652D7FCADCC4E93FCAEA97B4E876FFDE0C7C82A351C` |
| `dev-final-1790856359709/server-and-test.log` | `4304B280FF487C60EE3C791D3F0BDF25641FDC2A8DF850CD48130535945AB64C` |
| `build-final-1790856424693/build.log` | `94979BD8E11D4F2729635BC00188EEF779996EB3FB22B9A10E5E822E5ED7E15A` |
| `prod-final-1790856485767/server-and-test.log` | `8EAA392A90FC9AA2C22E0640966D14C6364C3EBC4BDE82E2F2588E4FB76164D7` |
| `src/app/ajustes/page.tsx` | `A529676E4057F35300BE51C3136C805EBB01FE4F8931B33732EA6A37DAB78F3E` |
| `src/app/ajustes/layout.tsx` | `0DCD5ECB3F1706AE69A6A88B917548F4DAD598B41B395646853817619041D9F3` |
| `src/app/ajustes/loading.tsx` | `43FA996226108505078C712EEEE988E9B5252CB71719C4451F16414C26F234CC` |

`evidence-final.json` guarda además los hashes de informes, resultados y
capturas. `run.mjs`, `playwright.config.ts` y `settings.spec.ts` conservan el
procedimiento local; los cuatro recorridos de mascota/visor usan los specs
versionados originales. La selección usa tres `testMatch` absolutos exactos.

El primer intento (`dev-1790855365536`) se conserva como **FAIL de colección**:
el buscador inicial incluyó un checkout viejo dentro de `.scratch` y cargó
Playwright por segunda vez. Ejecutó cero tests; sus cero errores de Ajustes
no cuentan como prueba del producto. Se acotó `testMatch` y se ejecutaron
lotes nuevos. Las variantes intermedias también quedan separadas de la final.

Los logs finales conservan dos mensajes `The destination stream closed early`
en dev y uno en start, ya rastreados en #1263. Los seis recorridos pasan;
no se suprimen esos mensajes ni se declara resuelta su causa. No hubo avisos
Gzip en estos lotes, lo que no resuelve #1251 ni su gate de preview pendiente.
La validación local no equivale a una aceptación de producción ni a toda la
suite del proyecto.
