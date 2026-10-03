# Alias de Biblioteca: conservar el tipo explícito (#1325)

> **[Candidato verificado con unitarios/tipos/lint y ocho casos nativos contra build de producción el 2026-10-03; RED original conservado; CI del lote exigida]**

El alias del perfil propio conserva ahora los tipos explícitos `book`, `movie`,
`series` y `todos`. Sin tipo o con un valor inválido mantiene `/coleccion`, donde
Biblioteca aplica su default. El visitante conserva la colección del perfil
visitado. Los ocho recorridos finales pasan en navegador contra el build del arreglo.

El RED nativo conservado confirmó el 2026-10-03 que el control directo
`/coleccion?type=movie` mantiene `movie` / Películas, pero el alias propio
termina en `/coleccion` con `book` / Libros. Fue un caso, cero retries, con
limpieza REST PASS. Build `qvnNjTgRKwN_3BAycNSkg`; la fuente de perfil servida
era idéntica a la base de este checkout. La auditoría global de esa pasada
sigue en FAIL por un POST sin clasificar, separado en #1301.

La evidencia original, conservada sin cambios, está en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/clock-fallback-alias1325-1791031910098/`:
`alias1325/result.json` SHA-256
`6e53cf6d4905b5b4b588914a4b1edf147ae9f5e466e1b0b1f91bfd8594bf5317`;
`public-manifest-01.sha256.json` SHA-256
`5431ae05451f98a637ee64c7ab8cb3f2e386550d2fb87fe1847b3eb8615ef9c3`.
La evidencia de implementación nueva vive en
`.scratch/ticket-campaign/20261002-resolve-all/alias1325-implementation/`.

## QA final del arreglo

Pasan **ocho casos, cero retries**, contra el único build nuevo de producción
`vk0dxnMykxanh8hNm62zS` (18,517 s). Se comparan alias y acceso directo para
`book`, `movie`, `series` y `todos`, comprobando URL, valor del formulario y
filtro visible. Sin tipo y con tipo inválido se conserva el default Libros de
la cuenta sembrada. Los visitantes anónimo y autenticado permanecen en la
colección del perfil visitado. La preparación sirve las mismas cinco fuentes
de producto/test/config congeladas del candidato; el informe se actualiza
después del snapshot final, sin reconstruir ni cambiar el comportamiento.

La pasada funcional y la infraestructura son PASS; **la auditoría global
conserva FAIL** por cinco POST cancelados. El probe pasivo observa su
`Next-Action` y los mapea a `pullPendingCelebrations` en el índice público del
build; identificar la acción y ver HTTP 200 no prueba ausencia de efectos ni
permite declararlos benignos. Su causa y su efecto siguen en #1301.

Las credenciales de fixtures sólo vivieron en memoria. Limpieza REST PASS:
actores ausentes, tablas de usuario vacías; Auth/sesiones/refresh/catálogo/cuota
a cero, 273 migraciones sin cambio. Next se detuvo y Supabase se apagó con
backup normal; puerto 3000 libre. Las nueve fuentes congeladas y los 208
artefactos de QA anteriores conservaron sus hashes; cero secretos detectados.

La copia pública sellada está en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/alias-resources-native-1791037489506/`:
277 artefactos copiados exactamente y 16 fuentes servidas conservadas; sin
manifiesto servidor raw ni `encryptionKey`. `capture-receipt.json` SHA-256
`8fcd8d548513a625be0ccd6bd37b88fc1adac4547c9d6a0b12343cd870c7be1b`;
`capture-manifest-01.sha256.json` SHA-256
`3979b99b126aa1a7799944bb3803ec610e1e961761b33d5579294a750529afc4`.
Resultado focal `alias-final/result.json` SHA-256
`3af7e85cf7b2ccd51023f890b05e4da65dbf1e70a2a60fc628a996d12416ee7f`.
La tanda conjunta conserva aparte el FAIL de Recursos (6 -> 5 al recargar,
#1328), observado en el primer intento; no se ejecutaron los otros dos.

## Preparación original · histórico de la fase anterior

La preparación siguiente quedó superada por el RED nativo descrito arriba.
Su fuente original y sus dos archivos de prueba/config están preservados en
`alias1325-implementation/baseline/`; los ocho recorridos preparados siguen
vigentes para el QA posterior. Las afirmaciones de sospecha o pendiente de
esta sección describen exclusivamente esa fase previa.

Issue: [#1325](https://github.com/borjar20/Biblioshare/issues/1325), todavía
`tipo:sospecha`. Base: `ebc0b82152ecfca8fc9a8c7238cb343a5dd91923`.
Checkout aislado: `.claude/worktrees/alias1325`, rama
`codex/profile-collection-type-1325`. No se ha modificado producto ni estado remoto.

## Qué debe confirmar el navegador

Con una cuenta desechable cuyo perfil declara únicamente `interests=['book']`,
el control directo `/coleccion?type=movie` debe mostrar el pill Películas activo
y el campo de búsqueda `type=movie`. El enlace antiguo
`/u/qa1325_alias_owner?tab=coleccion&type=movie` debe llegar al mismo ámbito.

La evidencia estática del checkout sigue siendo:

- `src/app/u/[username]/page.tsx:156`: el dueño y `tab=coleccion` redirigen
  incondicionalmente a `/coleccion`, sin trasladar `type`.
- `src/app/coleccion/page.tsx`: una URL sin tipo explícito consulta los intereses;
  `resolveEffectiveType` escoge `book` cuando es el único interés.
- `src/components/library/library-filters.tsx`: el campo oculto de búsqueda
  contiene el tipo efectivo y el pill seleccionado expone `aria-current=page`.
- El perfil de un visitante conserva su propia CollectionTab, con consulta a
  `passes` sujeta a RLS; no debe llegar a la biblioteca personal del visitante.

Esta cadena explica la sospecha, pero no prueba que la redirección real y la
pantalla nativa se comporten así. No se reclasifica la issue con esta preparación.

## Prueba preparada y ownership

- `e2e/ci/profile-collection-alias.spec.ts`: ocho casos. Cuatro comparan acceso
  directo y alias para `book`, `movie`, `series` y `todos`; dos fijan el contrato
  propuesto para ausencia y valor inválido; dos conservan el perfil visitado
  tanto con visitante anónimo como con visitante autenticado.
- `playwright.profile-alias-local.config.ts`: un worker, cero reintentos, destinos
  locales obligatorios y ningún `webServer`. No inicia Next ni toca el servidor
  de la campaña. Tampoco carga archivos de credenciales.
- El producto, una vez confirmada la reproducción, queda limitado a
  `src/app/u/[username]/page.tsx`. No requiere cambios en Biblioteca, esquema,
  permisos, dependencias ni CI común.

Cada caso comprueba y limpia sus dos UUID reservados por REST antes y después.
Antes de borrar una cuenta preexistente verifica su correo sintético y su
`user_metadata.qa_marker`; una colisión con otro propietario se rechaza. Esto
permite limpiar los restos de una pasada interrumpida sin adoptar cuentas ajenas.
El setup siembra el perfil y lee de vuelta el interés único, onboarding y
visibilidad pública. La limpieza exige Auth 404 y cero filas del actor en
`profiles`, `pet_state`, `pet_battles`, `passes`, `pet_acorn_ledger`,
`pet_cosmetics`, `pet_daily_missions` y `user_celebrations`.

No se siembra catálogo: el síntoma de este ticket es el ámbito de tipo seleccionado.
El campo efectivo y el pill visible permiten observarlo aun con biblioteca vacía;
no pretenden demostrar el contenido de una biblioteca con obras de varios tipos.
No se simulan Auth, la redirección, Supabase ni las consultas de Biblioteca.
Se desactivan traces y capturas automáticas para no conservar credenciales. Las
capturas explícitas se toman únicamente después de salir del login, en Biblioteca.

## Decisión propuesta sobre `type`

Se propone mantener el contrato actual del alias cuando falta `type`: adoptar
el valor por defecto de Biblioteca. Con un único interés `book`, sigue en libros.
Un valor inválido también se descarta y llega a ese valor por defecto.

Los cuatro valores explícitos `book`, `movie`, `series` y `todos` se conservan.
`todos` significa todos los tipos, aunque el perfil tenga un único interés;
es distinto de omitir `type`, según [#313](https://github.com/borjar20/Biblioshare/issues/313).
Esta decisión evita cambiar el arranque de Biblioteca y no convierte todos los
enlaces antiguos sin filtro en una selección explícita de todos los tipos.

Tras la confirmación, la corrección mínima es importar `ALL_TYPES_PARAM` y,
dentro de la condición de dueño ya existente, trasladar `parsedParams.type`
sólo cuando pertenezca a `VALID_TYPES` o sea `ALL_TYPES_PARAM`. En otro caso,
conservar `redirect('/coleccion')`. Los visitantes quedan fuera de esa condición.
La decisión deberá registrarse en `docs/requirements/decisiones.md` al entregar
la corrección, y la documentación de testing debe incorporar la pasada real.

## Ejecutar cuando el servidor local quede libre

Precondiciones:

1. El coordinador dispone de un único servidor de producción en
   `http://127.0.0.1:3000`, construido con la base indicada y Supabase local.
2. Docker y el esquema local completo ya están preparados por el QA de la
   campaña. Este checkout no los inicia ni hace reset.
3. Las claves locales se exportan al proceso mediante el `status` de esa
   instancia, nunca desde `.env.local` ni desde cuentas remotas. El servidor
   y el test deben usar la misma instancia. Una autenticación fallida es una
   precondición fallida, no una reproducción interpretable de #1325.
4. No ejecutar simultáneamente dos copias de este spec: los actores tienen
   UUID fijos para recuperar y limpiar restos de interrupciones.

Desde este checkout, con las variables locales ya exportadas:

```powershell
$aliasNode = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3000'
& $aliasNode '../../../node_modules/@playwright/test/cli.js' test --config playwright.profile-alias-local.config.ts --grep 'type=movie'
```

El caso focal primero exige que el control directo tenga `movie`; después
registra el destino del alias, el campo efectivo y los pills activos antes de
la aserción que debe ir a rojo si se pierde el tipo. Sólo un FAIL en esa
aserción, con control directo correcto y limpieza satisfactoria, confirma la
sospecha descrita. Un timeout de login, una cuenta no creada, un perfil no
visible o un error de conexión no la confirman.

La primera pasada debe conservarse en una ruta nueva si hay un resultado
interpretable. Ejemplo para repetir toda la superficie después de corregir:

```powershell
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = '.scratch/alias1325/report-after'
& $aliasNode '../../../node_modules/@playwright/test/cli.js' test --config playwright.profile-alias-local.config.ts --output '.scratch/alias1325/test-results-after'
```

Adjuntos: `cleanup-before`, `cleanup-after`, JSON de control directo/alias,
capturas de Biblioteca y observación del visitante. El informe HTML los reúne.
No usar `scripts/ci-local.mjs smoke` para esta fase: el config común inicia su
propio servidor de producción y exige un puerto libre.

## Checks realizados en esta preparación

| Check | Estado | Alcance |
|---|---|---|
| Playwright `--list` con valores de entorno sintéticos locales | PASS | 8 casos cargados; no backend ni navegador |
| TypeScript focal de spec y config | PASS | Sin emisión; resolución de módulos correcta |
| ESLint focal de spec y config | PASS | 0 errores, 0 avisos |
| Confirmación nativa con actor local | PENDING | A ejecutar con el servidor autorizado compartido |
| Build, CI y Git remoto | NOT RUN | Fuera de esta fase de preparación |

El primer lint detectó que llamar `use` al callback de fixture se interpretaba
como un hook de React. Se renombró el callback a `runFixture` y el lint posterior
pasó, sin desactivar reglas. Este fallo de andamiaje no es evidencia del producto.

Fuentes de la API de fixture: documentación oficial de
[createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
y [deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
y los helpers vivos de `e2e/ci/search-type-pills.spec.ts`. El índice de changelog
Markdown no pudo descargarse con los clientes disponibles; no se implementa
ninguna API nueva de Supabase ni se modifica su versión/configuración.

## Implementación del candidato

`src/lib/profile/collection-alias.ts` devuelve el destino del alias sólo para
el dueño con `tab=coleccion`. Reutiliza `resolveEffectiveType(type, [])` para
validar los tipos explícitos y `ALL_TYPES_PARAM` para conservar `todos`; no
duplica la lista de tipos ni consulta intereses o base de datos. Su ausencia
de intereses impide que el alias invente un filtro por defecto. La página
consume ese destino en el mismo punto de redirección, después de resolver
perfil y dueño, dentro de `ProfileContent` bajo Suspense. El alias de Panel
y las pestañas de visitantes conservan su flujo existente.

La extracción inicial conservó el destino anterior `/coleccion`. El test
focal de movie dio 1 FAIL / 7 PASS (los siete controles de effective-type).
Tras corregir la resolución, el mismo test y los controles dieron 8 PASS.
La cobertura posterior comprueba los cuatro tipos, ausencia/valores inválidos,
visitantes y otras pestañas sin mocks internos; contrasta además el ámbito
resultante con el resolver real de Biblioteca y el interés único book.

Se han leído las guías locales de Next 16.3.8 para page/searchParams, redirect
y Cache Components/Activity. No se añadió caché ni se movió el acceso a la
petición fuera del boundary. No hay copy nuevo, cambios de esquema, proveedores,
dependencias, configuración de producción, servicios o acciones de navegador
en esta fase de implementación.

La pasada completa de tipos detectó dos TS2345 en el spec preparado: el helper
`check<T>` infería sólo la rama con user no nulo de la unión `UserResponse`.
Se conserva `types-01.txt` y la fuente original. El helper ahora infiere la
respuesta completa y devuelve `T['data']`; conserva exactamente el chequeo de
error y el valor devuelto. No cambian las llamadas Auth, la fixture o cleanup.
Se consultaron la guía de Supabase y los tipos del SDK instalado; no se añadió
ninguna API del proveedor ni se ejecutó una consulta en esta fase.

Todos los checks usan el Node explícito v24.19.0 del runtime de Codex:

| Check del candidato | Estado | Evidencia / alcance |
|---|---|---|
| RED unitario focal | FAIL conservado | `unit-red-01.txt`: 1 FAIL / 7 PASS; destino `/coleccion` en vez de `?type=movie` |
| GREEN del mismo test | PASS | `unit-green-01.txt`: 8 PASS |
| Unitarios ampliados + effective-type | PASS | `unit-green-02.txt`: 23 PASS en dos archivos; 16 del alias y 7 controles existentes |
| TypeScript completo, noEmit e incremental=false | PASS | `types-02.txt`; `types-01.txt` conserva los dos errores de preparación corregidos |
| ESLint focal | PASS | `lint-02.txt`; página, helper, unitarios, spec y config; cero errores/avisos |
| Diff de página y whitespace de seis fuentes | PASS | `page-diff-01.patch`, `diff-check-01.txt` y manifiesto del candidato |
| Playwright --list | PASS | `list-01.json/txt`: ocho casos; entorno local sintético, sin fixtures, DB ni navegador |
| QA nativo del candidato / build | PENDING / NOT RUN | Se delegan al coordinador; no hay nuevo PASS nativo en este documento |
| Git remoto, commit, push, PR, merge | NOT RUN | Fuera de esta fase |

El QA nativo final debe ejecutar los ocho casos preparados contra una build
nueva del candidato, con el único Next3000 autorizado por el coordinador,
cero retries y cleanup REST antes/después. Un PASS unitario no sustituye esa
comprobación. La decisión canónica propuesta se entrega en scratch al
coordinador; los docs compartidos no se modifican desde este checkout.
