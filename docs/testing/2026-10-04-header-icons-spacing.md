# Cabecera — separación entre iconos (2026-10-04)

> **[Canónico · QA local contra Next dev el 2026-10-04]**
> Refinamiento de [#1349](https://github.com/borjar20/Biblioshare/issues/1349) y [PR #1351](https://github.com/borjar20/Biblioshare/pull/1351); acredita este candidato local.

Header retira `gap-1` del grupo de acciones y UserMenu retira `ml-1`.
**8 estados PASS**: 320/390/768/1280 px × claro/oscuro.

| Medida (px) | Antes | Después |
|---|---:|---:|
| Separación entre acciones | 4 | 0 |
| Separación antes del avatar | 8 | 0 |
| Ancho del grupo móvil | 144 | 132 |
| Ancho del grupo de escritorio | 192 | 176 |

Los targets mantienen 44 × 44 px, sin solapamiento entre controles y con
hit-testing correcto. Más y tema pasan Enter, Escape y foco; el perfil
mantiene su enlace directo. La campana se verifica únicamente con cero
avisos sin leer y su panel queda dentro del viewport.

Consola y `requestfailed`: **0**. Los logs de dev registran dos
`destination stream closed early` tras `fetchNotifications`, ya seguidos
en [#1263](https://github.com/borjar20/Biblioshare/issues/1263). El resultado
de navegador no acredita que todo el servidor esté libre de errores.
**17 unitarios existentes PASS** (16,45 s), ESLint de los dos archivos y
`git diff --check` PASS. Esta tanda no ejecuta build/start ni acredita despliegue.

Artefactos locales ignorados por Git:
[baseline-proof.json](../../test-results/header-gap/baseline-proof.json) y
[after-proof.json](../../test-results/header-gap/after-proof.json).
Capturas a 390 px: [antes claro](../../test-results/header-gap/baseline-light-390.png),
[después claro](../../test-results/header-gap/after-light-390.png),
[antes oscuro](../../test-results/header-gap/baseline-dark-390.png) y
[después oscuro](../../test-results/header-gap/after-dark-390.png).
