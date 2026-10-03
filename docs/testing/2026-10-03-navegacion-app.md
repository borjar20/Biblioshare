# Navegación de Biblioshare fuera del perfil

> **[Verificado local/dev el 2026-10-03 contra código, unitarios y navegador
> real con build/start en `codex/experiencias`; producción pendiente]**

La navegación principal pasa a Inicio, Biblioteca, Experiencias, Comunidad y
Buscar. El avatar abre el perfil; «Más» reúne Partidas, Mascota y Ajustes.
La barra principal cambia de inferior a superior en 768 px. Biblioteca incorpora
Cuaderno, Retos y objetivos y Estadísticas; Comunidad incorpora Clubes y Personas.
El perfil propio tiene Actividad y Experiencias, con Biblioteca adicional para
visitantes. Se conservan los permisos existentes y los aliases privados del dueño.

## Regresiones comprobadas durante la implementación

- Navegación y cabecera: RED antes del cambio de destinos y del cierre del menú
  al cambiar sólo query; GREEN 33/33 casos focales, incluidos los cuatro contratos
  existentes de pantalla completa. «Más» mantiene enlaces reales, teclado,
  Escape, cierre fuera y retorno de foco. Ruta y query resetean su capa.
- Perfil, Rincón y reactividad: RED de pestañas, aliases y nueva superficie;
  GREEN 32/32 casos focales. La identidad del Rincón viene de la sesión;
  los aliases privados de otra persona no permiten abrir sus herramientas.
  Guardar el objetivo invalida Inicio y el Rincón; mutaciones de clubes también
  invalidan Comunidad.
- Buscador de clubes: RED al navegar a `/clubes` desde Comunidad y al conservar
  un filtro antiguo; GREEN 5/5. La respuesta de una búsqueda en curso conserva
  texto y foco mientras se sigue escribiendo, una consulta externa cancela el
  debounce y las consultas pendientes no se envían dos veces.
- Traducciones por ruta: el navegador reprodujo `MISSING_MESSAGE` en los
  controles del Rincón y en las tarjetas/creación de clubes de Comunidad.
  Las dos rutas tienen ahora layouts con `RouteMessages` explícitos. El del
  Rincón conserva también los namespaces de Biblioteca porque los providers
  anidados reemplazan mensajes, sin fusionarlos. RED de `stats.editGoals` y
  `club.formSaveCreate`; GREEN 6/6 con los layouts y mensajes reales.

La suite completa antes de añadir estos dos providers pasó 436 archivos y
4298 pruebas en 339,39 s. Una primera pasada simultánea con build, TypeScript
y lint se interrumpió tras un timeout de 5 s en `manage-actions`; el mismo
archivo pasó 3/3 en 884 ms aislado. Se conserva el fallo y se repite la suite
sin compilación simultánea; no se modifican los timeouts ni se excluyen pruebas.
La coincidencia con otras comprobaciones es una condición de esa pasada, no
una causa demostrada del timeout. Entorno final: Windows, Node 22.23.1,
Next 16.3.8, Chromium de Playwright y Supabase de desarrollo.

La suite completa del código final, con los dos layouts y sus contratos,
termina con **437 archivos y 4304 pruebas PASS** en 364,09 s, código 0.

`npx tsc --noEmit`, `npm run build` y `npm run lint` terminan con código 0.
Lint mantiene las 28 advertencias anteriores, sin errores. No hay cambios de
esquema, dependencias, caché compartida ni configuración nativa.

El mapa derivado pasa `sync.mjs --check`: 134 nodos, 267 aristas, 26 flujos,
214 pasos. Las 17 claves nuevas de traducción están consumidas y los 3585
mensajes son válidos; las tres claves retiradas no tenían consumidores.

## Navegador real y limpieza

QA final: **11 recorridos funcionales, 32 vistas y 8 menús PASS**, en 86 s.
La matriz recorre perfil, Biblioteca, Experiencias y Comunidad a 390, 640,
768 y 1440 px, en claro y oscuro. Los tres tamaños menores usan puntero
coarse real; en 1440 se usa ratón. No hay overflow ni colisiones de cabecera,
cada vista tiene un solo `main` y un único h1 visible. Los controles nuevos
cumplen 44 px efectivos en táctil, incluido `tap-44` en la barra de 768 px.

Los recorridos comprueban teclado, Escape y retorno de foco; avatar y dos
pestañas propias; las tres herramientas de Biblioteca; edición real del
objetivo, persistencia al salir/volver y medidor coherente; filtros antiguos;
búsqueda pausada de clubes con foco, entrada nueva y Atrás; búsqueda de personas;
la ruta histórica de clubes y detalles reales de club y experiencia; gates de
pantalla completa; perfil visitante y retorno al login de rutas privadas.

Se creó un único recuerdo privado para comprobar su ruta singular y edición,
sin publicar ni subir fotos. Limpieza REST antes/después por creador y título:
raíz, momentos y participantes propios a cero. El objetivo diario vuelve a su
valor exacto anterior; `devtest` se conserva autenticable y público. Todos los
contextos de navegador y el script/copia de seguridad temporales se cerraron.

La consola y red finales no tienen errores de producto ni HTTP inesperados.
El informe identifica aparte 404/MIME de telemetría Vercel ausente en
`next start` local y peticiones canceladas al navegar, prefetch o cerrar un
contexto. No se interceptan para simular éxito. Se conservan los RED reales
de traducciones y los errores de selector del harness con su diagnóstico.

Las capturas, scripts de reproducción, `pointer-fidelity.json`, limpieza y
`qa-summary.json` están en el directorio de evidencia local
`C:/Users/borja/.codex/visualizations/2026/10/02/01a0fb75-6319-7093-ab05-7b306c149fb9/navegacion-2026-10-03/`.

Los tres specs permanentes (`ia-navegacion`, `navegacion-anonima` y
`a11y-landmark-main`) terminan con **23/23 PASS en 53,2 s, sin retries ni skips**
sobre el mismo build final. Incluyen recorridos por clics desde Inicio a 390/768,
las herramientas y el editor diario traducido, perfil, Más/teclado/historial,
foco de búsqueda, Personas, nav anónima, retorno tras login y landmarks.
Son de lectura: el objetivo se abre y cancela, sin guardar, y los traces están
desactivados. La configuración temporal hereda la canónica, reutiliza el servidor
de producción propio y omite `globalSetup` porque estos casos no usan semillas
de sagas ni requieren barrer otras cuentas.

La primera pasada dio 20 PASS y tres errores del spec: esperaba «Tus
estadísticas» en vez del h1 vigente «Estadísticas», y buscaba la identidad
también dentro del resultado de Personas oculto por Activity. Se corrigieron
los selectores y se repitieron los 23 casos sin cambiar el producto ni los
timeouts. Se conserva aquella evidencia en `playwright-output`; el resultado
final está en `playwright-final`, con sus logs de validación.

## Límites y seguimiento

Este delta no despliega la app ni el dominio de Experiencias en producción;
su entrega sigue en [#1293](https://github.com/borjar20/Biblioshare/issues/1293).
La posible pérdida del filtro de tipo en el alias antiguo de Biblioteca ya
existía en el commit `91ccadfa`; se registra aparte como sospecha en
[#1325](https://github.com/borjar20/Biblioshare/issues/1325), sin atribuirla a
esta navegación.
El aviso conocido de once listeners `drain` en `Gzip` se rastrea en
[#1251](https://github.com/borjar20/Biblioshare/issues/1251); no se atribuye a
una fuga ni a este delta sin baseline y stack.

La verificación del álbum anterior conserva sus cifras y alcance en
[su documento](2026-10-03-experiencias-album.md).
