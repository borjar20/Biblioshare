# Trampas conocidas

> **[Canónico · verificado contra código el 2026-08-19]**

Cosas que ya han costado horas en este proyecto, con la señal que las delata. **Léelo antes
de depurar algo raro** — la mitad de estas se han "descubierto" dos y tres veces.

Ordenadas por lo caras que salieron.

---

## 1. `library_entries` está congelada

**Síntoma:** un contador o un progreso sale a 0 % o con datos viejos, aunque la app muestre
bien el estado en otra pantalla.

`library_entries` fue la tabla de progreso, **ya no lo es**. Su `status` y su `position` no
se actualizan desde el pase-hub. El estado vivo está en `passes`.

Sobrevive solo para `pinned_order`, `queue_order` y `queue_id`.

**Regla:** cualquier feature que necesite el estado del usuario lo deriva de `passes`.
Ya causó el avance de sagas al 0 % (PR #96) y el hero descuadrado (#91).

---

## 2. «No se actualiza sin recargar»

Cuatro causas distintas, y **se comprueban en este orden**:

1. **El service worker sirviendo payloads RSC de caché.** Es la más traicionera porque
   parece un bug de React. **Descarta el SW ANTES de culpar a React o a Next** (PR #66).
2. Un componente que **duplica** estado del servidor en vez de derivarlo de props.
3. Falta el `router.refresh()` que reconcilia tras la mutación.
4. Una consulta que lee de `library_entries` (ver §1).

**Regla general:** derivar de props y reconciliar con `router.refresh()`; no duplicar estado
del servidor en el cliente.

Y una quinta, que hoy **no se ve**: revalidar de menos. Next todavía refresca al NAVEGAR
cualquier página ya visitada, así que una acción que se deja una ruta sin nombrar parece
correcta. Sus propios docs dan ese refresco por temporal. Ver §23.

---

## 3. La regla de los dos árboles (`:visible`)

**Síntoma:** un test falla con "element is hidden" sobre algo que en pantalla se ve
perfectamente.

Cuando una pantalla pinta lo mismo en dos árboles por breakpoint (`lg:hidden` /
`hidden lg:block`), **el que no toca se queda en el DOM, apagado**. La suite corre a 1280, y
`getByTestId(...)` o `.first()` cazan el oculto.

**Regla:** con dos árboles, **todo locator lleva `:visible`** —
`page.locator("h1:visible")`, `locator("visible=true")`.

Ha roto tests tres veces: 5 asserts en la ficha (#50), 2 en el feed (#69), y otra vez en
Inicio. El patrón de dos árboles solo es seguro para **duplicados sin estado**.

---

## 4. Un `loading.tsx` mata el 404

Un `loading.tsx` es una frontera de Suspense de ruta: arranca el streaming y **compromete el
200**, así que `notFound()` ya no puede devolver 404.

**Regla:** solo en rutas que **no** llaman a `notFound()` — hoy `(home)`, `buscar`,
`clubes`, `coleccion`, `estadisticas`.

El de Inicio vive en el route group `(home)` a propósito: uno en la raíz se filtra a **toda**
la app y le roba el 404 a todas las rutas.

---

## 5. E2E: mira la carga de la máquina antes que tu código

**Síntoma:** cae media suite de golpe, con asserts inconexos entre sí.

Casi siempre es el entorno, no el código:

- Supabase es **remoto también en dev** (~240 ms/consulta, picos de 1,3 s).
- Con varias sesiones en paralelo, el home autenticado pasa de 4 s a 20 s.
- En una máquina de 8 GB, `next dev` + Chromium no caben: el server muere a mitad de suite y
  los workers caen con `worker process exited unexpectedly (code=3221225794)`.

**Señales para distinguirlo:**

| Señal | Significa |
|---|---|
| El test que falla **se mueve** en cada pasada | Entorno |
| Falla **siempre el mismo assert** y no se mueve | Bug real |
| `worker process exited unexpectedly` | El proceso murió, no es un assert |
| `page.goto` que no llega | Server caído, no producto |

**Un fallo puede parecer producto y no serlo**: `.react-flow__node` con `toHaveCount → 0`
("el grafo no se pinta") era el server agonizando. Repetido en tandas de 2–3 specs sobre un
server sano: 16/16 verde.

**Forma barata de zanjarlo:** worktree de baseline sobre `origin/main` y correr **solo** el
test que falla en las dos ramas. Y no montes un A/B con el server exhausto en una rama y
recién arrancado en la otra: eso mide el cansancio, no tu cambio.

---

## 6. Antes de arreglar un fallo, mira si falla lo que lo MIDE

Ha pasado tres veces con tres instrumentos distintos:

- **`grep -oE '^…KEY='`** — con `-o` grep imprime solo lo que casa, y la regex acababa en
  `=`, así que mostraba la clave tuviera valor o no. Llegó a contaminar 2 PRs y un plan con
  la afirmación falsa de que las API keys estaban vacías.
  Para ver si una var tiene valor: `awk -F= '/^CLAVE=/ {print length($2)}'`.
- **`innerText`** devuelve el texto ya transformado por CSS: buscar `includes("Para más
  tarde")` falla si el rótulo va en `uppercase`.
- **`getComputedStyle().borderTopWidth`** devuelve **0,8px tanto para `border` (1px) como
  para `border-[1.5px]`** en el Chrome de Playwright. No sirve para verificar anchos de
  borde, y casi provoca "arreglar" una clase correcta.
- **`git stash push <ruta>`** NO guarda ficheros untracked: falla entero y te deja creyendo
  que revertiste. Un A/B así da el mismo número dos veces y parece que el fix no hace nada.
  Usa `--include-untracked`.

---

## 7. Tailwind: clases enteras y valores arbitrarios ambiguos

- **Las clases se escriben enteras, nunca interpoladas** — el JIT escanea texto. Por eso
  `media-accent.ts` lista `"border-type-book/30"` completo en vez de construirlo.
- **`border-[1.5px]` sí funciona**; `border-[length:1.5px]` **no** (para esa variante no se
  emite regla). Si dudas de si una utilidad se generó, búscala en `document.styleSheets`, no
  midas el valor computado (ver §6).

---

## 8. Storage no valida JWT ES256

**Síntoma:** subir una imagen da 400 o un error de RLS que parece de permisos.

Supabase Storage no reconoce los JWT ES256 que emite el proyecto. **Las subidas van por
service-role desde server actions**, nunca desde el cliente (PR #75).

---

## 9. Importar: una fila por visionado no es una fila por obra

**Arreglado el 2026-07-20, pero la forma del error se repite.**

`diary.csv` de Letterboxd trae **una fila por visionado**, así que una película
vista tres veces aparece tres veces. `commit-row.ts`, en cambio, espera una fila
por OBRA con todas sus fechas en `diaryDates` — el pase activo se queda la más
reciente y el resto entran como históricos.

Al no agrupar, cada visionado llegaba solo con su fecha, el insert del pase
activo chocaba con `passes_one_active` y esa fecha **se descartaba en silencio**:
los revisionados se perdían y se reportaban como «duplicado», que suena inocuo.

Segundo camino del mismo fallo: `addHistoricalPasses` recibía un `skip` con la
fecha más reciente **aunque el pase activo ya existiera de antes**. Al reimportar
un CSV sobre una biblioteca con historial, el visionado nuevo se saltaba. El
`skip` solo es legítimo cuando el pase activo se acaba de crear CON esa fecha.

**La lección general:** cuando un parser y su consumidor discrepan sobre qué es
una fila —visionado vs. obra—, el síntoma no es un error, es **datos que faltan
sin avisar**. Y «duplicado» en un informe de importación merece desconfianza:
puede significar «lo tiré».

## 10. `rereadCount` no es el ordinal del pase

Cuenta los pases **cerrados**; el actual es +1. La primera lectura siempre sale bien, así que
el fallo **pasa desapercibido hasta que alguien relee**.

---

## 11. Las series no tienen `progress_sessions`

Se miden en episodios. Cualquier orden por "última sesión" manda **todas** las series al
final si no se contempla — y entonces ninguna puede ser la destacada.

---

## 12. Migraciones: el ledger miente

- **"No aparece en `list_migrations`" ≠ "no está en prod".**
  `20260716_list_challenge_completion_mode.sql` está aplicada pero **sin registrar**. Para
  saber si algo existe de verdad, mira los **objetos** (`pg_proc`, `pg_class`), no el ledger.
- El orden de `schema-baseline.sql` es el de **aplicación real en prod**, no el alfabético de
  ficheros.
- Antes de decidir "esto no se arregla sin `pg_dump`", comprueba si las migraciones que
  faltan tienen `.sql`: si lo tienen, el append fiel gana.

---

## 13. Las maquetas son documentos vivos

`Ficha` pasó de 7 a 12 frames, `Clubes` de 8 a 12, y `Perfil` fue reescrito entero en un v2
que **deroga** las maquetas anteriores.

**Antes de calcar, comprueba la fecha del `.html`.** Y cuidado al mezclar frames de distinta
época: dos maquetas que nunca se vieron entre sí producen choques (pasó con el rail de Inicio
contra el bloque de hoy, y con los dos shells de escritorio de la ficha).

---

## 14. Los docs de plan apuntan a ficheros que se movieron

Ha pasado en **tres planes seguidos** (02, 03, 04): rutas que ya no existen, o un componente
dado por ausente que sí estaba.

**Verificar las rutas del plan antes de codificar es obligatorio, no opcional.** En el plan
03, seguir el doc al pie de la letra habría restyleado las listas de seguidores por error.

---

## 15. Preparar datos por la UI no funciona

De 8 intentos de "Seguir" hechos navegando (buscar → ficha) solo cuajó 1.

**Para preparar datos, SQL directo** contra obras que ya estén en catálogo, anotando ids para
borrarlos exactos. La UI es para **verificar**, no para sembrar.

---

## 16. El badge «Pendiente» es optimista: no prueba que se haya guardado nada

**CERRADO el 2026-07-21 (issue #106).** El diagnóstico que estaba aquí escrito —«la
navegación aborta la server action»— resultó **falso**, y conviene saber por qué para no
volver a él: era una hipótesis anotada como si fuera un hecho.

**Lo que pasaba de verdad.** Instrumentando `addExistingItemToLibrary` y `applyTransition`
se vio que la acción **sí se ejecuta**, el plan es `createActive` y el insert devuelve fila
con `error: null`. El pase **se crea siempre**. Lo que fallaba era el orden:

```
ENTRA addExistingItemToLibrary
getLibraryItems pases activos= 11     ← la petición de /coleccion, ya en marcha
insert passes -> created              ← el insert aterriza DESPUÉS
getLibraryItems DEVUELVE 7            ← sin la obra recién seguida
```

La causa raíz es que **el optimismo se comía su propia señal**: `useFollow` publica el estado
en el mismo tick en que dispara la acción, y `HeroStatusOrFollow` cambia entonces el botón
«Seguir» —dueño de su `isPending`— por el badge. Resultado: **nada en el DOM decía que la
escritura seguía en vuelo**, así que ni el usuario ni un test podían esperarla, y quien se
iba a Colección en ese medio segundo no encontraba la obra.

Arreglado publicando `isSaving` en `ItemStatusContext` y exponiéndolo como `aria-busy` en el
badge (las dos caras, hero y rail). De paso faltaba `revalidateLibrary()` en la acción: seguir
mete la obra en la biblioteca y `/coleccion` no se revalidaba.

**Lo que sigue siendo cierto y es la trampa de verdad:** el badge «Pendiente» y la pestaña
«Mi registro» son **optimistas** y aparecen antes de que exista la fila en `passes`. **No
prueban que se haya persistido nada**; solo lo prueban `aria-busy="false"`, que la obra salga
en `/coleccion?tab=todo`, o una consulta a `passes`.

Corolario de depuración: no des por bueno «se guardó» mirando un badge optimista, y
recuerda que los e2e **se autolimpian en `afterAll`** — consultar la BD después de que el
test termine no demuestra nada, hay que consultarla *mientras corre*.

## 17. Retirar una feature: busca sus escrituras, no solo su pantalla

Al quitar las colas (2026-07-20) la fase A retiró el *visor* y dio el trabajo por hecho,
pero el *asignador* seguía vivo: las tres fichas ofrecían «añadir a cola» y escribían
`queue_id` en una cola ya invisible. El grep de «¿quién enlaza a esta pantalla?» encuentra
el visor y **no** encuentra a quien produce los datos.

Y al revés: al borrar una pantalla, mira qué **efectos colaterales** solo ocurrían allí.
`backfillQueueSizes` —lo único que rellenaba `movies.duration_minutes` y
`series.total_episodes`— se invocaba solo desde el panel de Colas, así que llevaba meses
sin ejecutarse sin que nadie lo notara.

**Orden de despliegue al borrar esquema: código primero, `DROP` después.** Producción sirve
el código anterior hasta que despliegas; si borras la tabla antes, el código viejo la sigue
pidiendo y se lleva por delante las rutas que la usan.

## 18. Un aviso del sistema no cabe en un modelo con forma de persona

Al montar el recordatorio de evento (2026-08-04) hacía falta escribir en `notifications` sin
que hubiera nadie que hubiera *hecho* nada: lo dispara un trabajo programado. Se intentó
evitar tocar la tabla poniendo al **organizador del evento** como actor, y falló por dos
sitios distintos que solo aparecieron ejecutándolo:

1. **`filter_unblocked_user_ids` devuelve un array VACÍO cuando `auth.uid()` es null**, y el
   barrido corre con `service_role`, sin sesión. Resultado: `claimed 3, delivered 0`, y
   **ni un error en el log** — `notifyMany` es best-effort y devolver `[]` es un camino
   silencioso. Si un fan-out entrega cero sin quejarse, sospecha del filtro de bloqueos antes
   que de la escritura.
2. **`notifications` tiene `CHECK (user_id <> actor_id)`**, así que el organizador que sigue
   su propio evento no podía recibir su recordatorio (23514): justo la persona que lo monta
   se quedaba sin aviso.

Las dos son el mismo síntoma. La solución fue **arreglar el modelo** (`actor_id` nullable,
CHECK relajado a «si hay actor, no puede ser el destinatario») en vez de seguir parcheando
alrededor. Regla: **cuando hacen falta dos parches seguidos para meter algo por un modelo, el
bug es el modelo.** Un aviso emitido por el sistema va con `actorId: null` y
`systemDelivery: true` en `notifyMany`.

## 19. Deshabilitar un botón enfocado le roba el foco, y no se lo devuelve

`disabled={isPending}` es el patrón normal para cortar la doble pulsación, y en un CTA suelto
no molesta. **Dentro de una lista sí**: al pulsar con teclado, el navegador blurea el elemento
que acaba de deshabilitarse y al re-habilitarlo el foco NO vuelve — quien navega con teclado
acaba en el `body` habiendo perdido su sitio entre las filas. Lo cazó un test de teclado del
seguimiento de eventos, no una revisión visual.

Para un control dentro de una lista: **`aria-disabled` en vez de `disabled`**, más una guarda
`if (isPending) return;` en el handler (y la idempotencia de la RPC detrás, que es la que de
verdad protege). Así sigue siendo enfocable y la tecnología asistiva sabe que está inerte.

## 20. Que un test pase no significa que proteja lo que dice proteger

En el mismo trabajo se escribió un test de teclado «para que el botón de seguir no acabe
dentro del `<a>` de la fila». Se comprobó **mutando el código a propósito** —metiendo el
`<button>` dentro del `<a>`— y el test **siguió pasando**: Chrome mantiene enfocable un botón
anidado aunque el HTML sea inválido, así que el orden de tabulación no distingue los dos
casos. Lo que sí caza ese bug es otro test, el del clic, porque con el botón anidado el clic
**navega** y la marca que se esperaba en el calendario nunca aparece.

Moraleja práctica: cuando escribas un test para impedir un bug concreto, **provoca el bug y
comprueba que el test se pone rojo**. Si no lo hace, el test mide otra cosa — y es peor que no
tenerlo, porque da confianza falsa. Los comentarios de los dos tests de
`club-evento-seguimiento.spec.ts` dicen ahora explícitamente qué protege cada uno y qué no.

## 21. Otras dos, cortas

- **Un `.next` a medias** (p. ej. borrar `.next/dev/types` con el server vivo) hace que
  **todas** las rutas den 404, `/` incluida. Se cura con `rm -rf .next`.
- **`test-results/error-context.md` guarda la contraseña del login en claro.** Está
  gitignorado, pero no lo pegues en una conversación ni en una PR.
- **El `badge` de una notificación NO admite el icono normal.** Android se queda solo con
  su canal alfa, así que `/icon-192` (terracota opaco de borde a borde) sale como un
  cuadrado macizo en la barra de estado. Por eso existe `/badge-96`, transparente. Y `icon`
  y `badge` son dos imágenes distintas: sin `badge`, Chrome pone su propio logo.

## 22. Un `node_modules` enlazado por junction se VACÍA al del checkout principal

Al abrir un worktree bajo `.claude/worktrees/` no viene `node_modules`, y el atajo instintivo
para no duplicar ~400 MB —enlazarlo por junction al del checkout principal
(`cmd /c "mklink /J node_modules ...\Biblioshare\node_modules"`)— es una trampa: `npx tsc`,
`vitest` y `next build` funcionan varias pasadas, pero en cuanto corre Playwright (que levanta
su propio `npm run dev` **a través** del enlace) el `npm` resuelve la ruta real y **poda el
`node_modules` del checkout PRINCIPAL** (411 entradas → 0). El principal queda inservible: `npx
tsc` responde «This is not the tsc command you are looking for» (se puso a instalar el paquete
basura `tsc@2.0.4`). Se recupera con `npm ci` (~2 min), pero cuesta media hora de desconcierto.

Regla: **`npm ci` DENTRO del worktree, nunca junction.** Dos árboles independientes, ningún
estado compartido — es lo único que no vuelve a romperlo. Issue #389.

---

## 23. Invalidar caché: `updateTag` y `revalidateTag` no son intercambiables

**Síntoma:** compila, pasa el typecheck, pasa los unitarios, y en producción sale por el log
`updateTag can only be called from within a Server Action` — o peor, nada, porque el `try/catch`
de quien la llamó se la come.

Las dos invalidan una etiqueta y **no valen en los mismos sitios**:

| | Dónde es legal | Qué hace |
|---|---|---|
| `updateTag(tag)` | **Solo** dentro de una server action | La SIGUIENTE petición espera al dato fresco (read-your-own-writes) |
| `revalidateTag(tag, perfil)` | Server functions y route handlers | Marca caducado; se recalcula cuando toque |

Ninguna de las dos es legal **durante un render**. Y en este repo hay escrituras que ocurren
justo ahí: el enriquecimiento perezoso (`ensureItemEnriched`, `persistCollectionMembership`)
corre dentro del render de la ficha, no en una acción. La salida es `after()` — pero entonces
ya no estás en una server action, así que ahí toca `revalidateTag`, nunca `updateTag`.

Dos detalles que cuestan una pasada cada uno:

- **`revalidateTag` exige el segundo argumento** en Next 16. Sin `{ expire: 0 }` la entrada
  sigue viva su `cacheLife` completo: llamas a la función y no caduca nada.
- **Dentro de `after()` no se puede tocar el cliente Supabase de la petición.** Su adaptador
  de cookies llama a `cookies()` cuando lanza la consulta, no al construirse, y Next lo
  rechaza — con lo que la escritura no ocurre y el `catch` la silencia. Es la issue #751,
  y tiene sección propia abajo (§24) porque la salida obvia no funciona.

En el repo esto está resuelto por nombre: los helpers de `src/lib/reactivity/revalidate.ts`
que se llaman `revalidate*` usan `updateTag` y son para server actions; los que se llaman
`expire*` usan `revalidateTag` y son para `after()`. Un test lo fija
(`revalidate.test.ts`, «expireSagaMembership usa revalidateTag, NUNCA updateTag»).

**Y el corolario:** esto **solo se ve contra `next start`**, igual que los errores de `use cache`
que documenta AGENTS.md. `next dev` no lo destapa. Origen: acción 9 de la auditoría 2026-08
(F1-023), decisiones.md del 2026-08-21 tarde.

## 24. `after()` + Supabase: el cliente de la petición no cruza, y service_role tampoco vale

**Síntoma:** ninguno. La página se pinta, los tests pasan, y en el log de `next start` aparece
una línea suelta:

```
⨯ Error: Route /libro/[id] used `cookies()` inside `after()` while rendering.
```

La escritura que iba en ese `after()` no ocurrió, y no ocurrirá nunca. Fue la issue #751: la
hidratación perezosa de las tres fichas llevaba semanas sin curar una sola fila en producción.

**Por qué no se ve.** Tres capas tapan el fallo, y hay que quitarlas todas:

1. `ensure*Hydrated` **nunca lanza** — el `try/catch` existe para que un fallo de OpenLibrary o
   TMDB no tumbe la ficha, que es el contrato correcto, y de paso se come esto.
2. `next dev` no lo enseña. **Solo el build de producción**, igual que los errores de `use cache`.
3. El test que lo cubría se conformaba con «la ficha sigue viva», que no distingue «se hidrató»
   de «se tragó el error». Ver §20.

**Por qué pasa.** `createClient()` resuelve `await cookies()` al construirse, pero le pasa al
cliente un adaptador cuyo `getAll()` corre en **cada consulta**. Pasar ese cliente a un callback
de `after()` por closure es, en diferido, llamar a `cookies()` dentro del callback — prohibido en
Server Components (páginas, layouts y `generateMetadata`; en Route Handlers **sí** vale, lo dice
la doc de `after` con un ejemplo).

**Y aquí está la trampa de segundo orden:** la salida evidente —`createServiceRoleClient()`, que
no toca cookies— **no funciona para esto**. Las RPC de catálogo cortan solas:

```
hydrate_book rpc failed { code: 'P0001', message: 'authentication required' }
```

`hydrate_book`, `hydrate_movie` y `hydrate_series` empiezan con `if auth.uid() is null then raise`,
que es parte del blindaje del catálogo (#674). `service_role` tiene los grants —EXECUTE en las tres
y UPDATE en `books`, comprobado— pero **no tiene `auth.uid()`**. Se pasa el guard de permisos y se
choca con el de sesión, que es peor que fallar antes: parece que va.

**Lo que sí funciona:** leer el token DURANTE el render y pasarlo como valor.

```ts
const accessToken = await getAccessToken();          // durante el render
if (accessToken) {
  after(() => ensureBookHydrated(createTokenClient(accessToken), { … }));
}
```

`createTokenClient` (en `src/lib/supabase/server.ts`) construye un cliente sin cookies con el token
en la cabecera `Authorization`: RLS sigue aplicando con la identidad del usuario y `auth.uid()`
devuelve su id, así que **el arreglo no cuesta ni un grant**. Es el patrón que manda la doc de
`after`: «read request data before `after` […] and pass the values in».

**El guard.** `src/lib/reactivity/after-guard.test.ts` recorre los Server Components y falla
nombrando el fichero si un callback de `after()` menciona `supabase`, `createClient`,
`getCurrentUser`, `getAccessToken`, `cookies` o `headers`. Se probó en rojo antes de darlo por
bueno: nombraba las tres fichas.

Origen: issue #751, 2026-08-21.
