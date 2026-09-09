# Mascota R4b — Primer botín con efecto

> **[Diseño en planificación · actualizado el 2026-09-08]**
> Contrato heredado: hoja de ruta Parte II, R4b; issue #1123.
> Base leída: `main` en `cbf9d65e`, con R4a integrada mediante #1127.
> Este documento concreta el diseño; no acredita implementación, balance medido ni arte generado.
> El usuario confirma una copia por aventura y calidad sin resorteos, y pide crear el plan.
> Plan: `docs/superpowers/plans/2026-09-08-mascota-r4b-botin.md`. Sus elecciones técnicas
> concretan esta propuesta; los números siguen siendo candidatos de calibración.

## 1. Punto de partida y alcance

R3 tiene aceptación jugable registrada el 2026-09-07. La hoja de ruta registra R4a
implementada y aceptada, y el modelo de datos documenta su migración verificada en
producción antes del merge de #1127. El 2026-09-08 el usuario pide sincronizar la
documentación y avanzar con R4b. No se infieren nuevas partidas ni mediciones de hábitos.

R4a ya guarda seis ids estables en `pet_battles.reward`. `inventoryFrom` cuenta las
copias del histórico de victorias: ese histórico sigue siendo la fuente del inventario.
R4b permite equipar un arma y un amuleto y hace efectivos los seis objetos en r4.2.
Incluye comparación, iconos y VFX. Refinamiento acordado el 2026-09-08: las copias de
un mismo objeto conservan el efecto pero tienen un multiplicador de potencia variable,
fijado al obtenerlas. Encontrar una copia mejor es independiente de la futura tinta.
No cambia XP, nivel visible, etapa ni concesión de aventuras. Se conserva la selección
del tipo de objeto de R4a; se amplía el diseño de su calidad, sin resorteos por reintento.

**Tinta y desencantado: utilidad aplazada, #1134.** El usuario quiere que las mejoras
y el avance de la ardilla estén ligados al uso de la app, no a jugar. No se aprobaron
mejoras de ranura ni atributos comprados con tinta, ni mejorar el multiplicador con
ella. No se da por aprobado implementar saldo, conversión o gasto antes de definir
su utilidad. Esta decisión sustituye la propuesta inicial de mejoras garantizadas.

## 2. Experiencia propuesta

La sección de equipo de `/mascota` muestra las dos ranuras y el inventario agrupado
por ranura, con nombre, efecto concreto, potencia de cada copia y estado equipado. Seleccionar un
objeto presenta el equipado y el candidato juntos, con sus efectos completos: no hay
un indicador global de «mejor», porque ofrecen decisiones distintas.

Equipar y quitar equipo es gratis. Cada ranura admite vacío. Nadie recibe selección
automática al publicar R4b: lo ganado aparece utilizable y el usuario elige. La victoria
presenta la copia recibida y permite comparar su efecto efectivo con el equipado.
El multiplicador queda fijo: conseguir una versión mejor requiere obtener otra copia,
no gastar tinta ni volver a resolver la misma recompensa. No se fusionan automáticamente
copias de distinta potencia ni se destruyen las inferiores. La utilidad de desencantar
queda registrada en #1134; no se ofrece una conversión sin un uso decidido para la tinta.

La selección se guarda entre dispositivos. Mientras se envía una elección, se evita
un segundo envío desde ese control. Ante un fallo se conserva la selección confirmada
y se permite reintentar; no se anuncia éxito antes de confirmación del servidor.
El cambio invalida la sección y los inicios posteriores leen la selección vigente.

### Equipo y combates ya iniciados

La ficha permite preparar el **próximo combate**. No hay controles de equipo en la
pantalla de combate ni en el interludio entre tramos. El inicio guarda una foto del
equipo; reanudar nunca la sustituye por la selección actual. La ficha explica esta
diferencia cuando existe una aventura abierta. Un reintento tras derrota es un nuevo
combate y sí toma la selección nueva.

Esta interpretación evita bloquear la ficha por entrenamientos abiertos antiguos:
el repositorio de entrenamiento permite varias intenciones sin resolver. Bloquear
por cualquier fila abierta obligaría a añadir un ciclo de abandono/cancelación ajeno
al contrato. El entrenamiento nuevo usa equipo para probarlo gratuitamente.

## 3. Efectos y primera calibración

Los ids y las ranuras de `src/lib/pet/loot/catalog.ts` se conservan. Los números de
esta tabla son **candidatos de simulación**, no un balance aprobado. Se ajustan antes
de publicar r4.2, sin modificar r4.1. Todo el balance vive dentro de la nueva versión
y forma parte de su hash de contenido. Con calidad variable, esta tabla define efectos
base candidatos: el rango y distribución del multiplicador, su aplicación y el valor
de las copias históricas se concretan en #1123 antes de implementar. La tabla ya no
representa valores idénticos para todas las copias de un objeto.

| Objeto | Ranura | Efecto propuesto | Candidato inicial |
|---|---|---|---|
| `sharp_bookmark` | Arma | Daño adicional solo al interrumpir una carga con éxito | +25 % al daño de interrupción |
| `heavy_ink_quill` | Arma | Aumenta la bonificación de daño de la receta Potencia, proporcional a aciertos; no altera el daño base al saltar | +50 % a la bonificación de Potencia |
| `librarian_loupe` | Arma | Alarga cada ventana vulnerable que el enemigo ya genera; no crea vulnerabilidad en Brote ni alarga el aturdimiento | +10 ticks (1 s) |
| `last_page_amulet` | Amuleto | Usar cualquier ulti concede barrera, incluso saltando el puzzle; se suma a Protección | 5 % de la vida máxima |
| `loan_pendant` | Amuleto | Reduce la recarga de esa habilidad solo si interrumpe con éxito | −15 ticks (1,5 s) |
| `streak_medallion` | Amuleto | Recupera vida al empezar cada tramo, limitada al máximo; no revive ni modifica atributos | 5 % de la vida máxima |

El medallón no hace nada al comenzar con toda la vida: se dice en la descripción.
No aumenta `hpMax`, ya que los enemigos escalan su daño desde esa cifra. La cura
ocurre una vez al entrar al tramo; recargar o reanudar no la repite. Si se pierde por
KO, no se llega al tramo siguiente y no hay cura. La lupa es situacional contra
Coraza; la comparación lo explica en lugar de prometer un bonus universal.

Porcentajes con enteros y redondeo hacia abajo, después del cálculo base del efecto;
la recarga nunca baja de un tick. No se añaden tiradas durante el combate para los
objetos: el multiplicador proviene de la recompensa guardada y entra en el snapshot.
El orden de transiciones, inputs, básicas y final de tramo sigue siendo el de R4a.
Los efectos producen eventos identificados por objeto, consumidos por UI y replay;
el cliente no dispara efectos de juego por terminar una animación.

## 4. Persistencia, autoridad y concurrencia

**Alternativas consideradas.** Guardar objetos e inventario en una tabla nueva
duplicaría el historial de R4a. Dos columnas en `pet_state` mezclarían equipo con
identidad y exigirían ampliar sus grants. Se propone una tabla pequeña de selección
`pet_loadout`, separada, con `user_id` único y referencia nullable a la copia equipada
en cada ranura, más fecha de actualización. Ausencia de fila significa ambas ranuras
vacías. El diseño inicial con solo ids de catálogo queda sustituido: ya no basta para
distinguir dos copias con distinta potencia. La identidad de copia y la compatibilidad
de recompensas de R4a se concretan en #1123 antes de cerrar la persistencia.

La tabla tiene RLS y lectura exclusiva del dueño. La escritura pasa por el servidor
autenticado, que comprueba copia, potencia guardada, ranura y posesión contra victorias; ni el
cliente ni una llamada directa pueden inventar un objeto. La operación de escritura
vuelve a validar esas condiciones en base de datos. Los permisos de las funciones
se revocan de PUBLIC y anon; solo se otorga la ejecución que requiera la ruta elegida.
No se añade caché compartida a ninguna lectura de equipo o inventario.

Equipar y crear un combate serializan por usuario usando la misma clave de bloqueo
que las aventuras (`20260908`, hoy documentada como reservada a aventuras). El inicio
lee la selección y la incorpora al snapshot dentro de la misma transacción que crea
el combate. En una carrera equipar/iniciar, se guarda por completo la selección
anterior o la nueva. Nunca se confía en un equipo enviado por el navegador.

El inicio de entrenamiento debe usar también esta frontera atómica, pues hoy inserta
directamente en `pet_battles`. Se conserva la idempotencia por intención: recuperar
una intención existente devuelve el snapshot guardado, aunque el equipo haya cambiado.
Resolver sigue re-simulando con la versión almacenada y conserva el primer resultado.
Las firmas vigentes siguen disponibles para el código anterior durante el despliegue;
las nuevas rutas r4.2 usan funciones versionadas o extensiones compatibles.

La migración se prueba en dev primero, con matriz de roles, propiedad, posesión y
concurrencia real de dos conexiones. Se registra en el manifiesto de bootstrap y se
regenera el baseline. `data-model.md` describe solo lo realmente aplicado y verificado,
incluida la ampliación de la clave de bloqueo. Producción se verifica contra objetos
reales antes de publicar el código dependiente.

## 5. Motor y compatibilidad

Se crea `versions/r4.2` con la herramienta de versiones existente. La nueva versión
contiene el catálogo mecánico cerrado, validación del equipo del snapshot, efectos,
eventos y fixtures. No importa valores mecánicos del catálogo mutable de presentación.
El snapshot r4.2 exige las dos ranuras explícitas y la potencia fija de cada copia,
admitiendo null y rechazando ids desconocidos, potencias fuera del rango o ranuras
incorrectas. Los snapshots antiguos los validan sus motores
conservados. Los contratos compartidos permiten representar ambas generaciones.

Los eventos y el digest se re-simulan desde ese snapshot y su contenido congelado.
El replay no consulta equipo, inventario ni atributos actuales. Se conservan motores,
fixtures y manifiestos de r2.2, r3.1 y r4.1 byte a byte. La publicación sigue
`fork` → edición/calibración → `golden --version` → `freeze` y registro append-only.
No se congela el candidato antes de cerrar el balance.

## 6. Arte y accesibilidad

Seis iconos PixelLab con siluetas reconocibles y VFX breves ligados a los efectos
del motor. Se sigue la spec canónica de arte y el agente de arte del proyecto;
no se sustituyen los sprites de clase ni se amplía la caja de la compañera.
Los candidatos permanecen fuera de `public/pet/` hasta su elección.

Nombres, efectos y resultados deben entenderse sin animación ni color. Equipo,
comparación y selección se recorren con teclado, foco visible y nombres accesibles;
móvil no depende de hover. Movimiento reducido conserva el texto del efecto.
No se declara R4b terminada con iconos provisionales o VFX pendientes.

## 7. Verificación y criterios de salida

1. **Motor:** tests de activación y no activación para cada objeto, redondeos,
   límites, interacción con Protección/vulnerabilidad, KO y fronteras de tramo.
   Reanudar no repite curas. Equipo vacío reproduce los resultados de r4.1 con los
   mismos inputs y seeds (el digest r4.2 difiere por versión/snapshot).
2. **Balance:** comparar las 16 combinaciones (tres armas + vacío por tres amuletos
   + vacío), además de calidad mínima, intermedia y máxima, en entrenamiento y cadenas
   de tres, con los mismos seeds y los seis
   perfiles de referencia. Incluir políticas sin pulsar, spam, interrupción + ulti
   y espera de vulnerabilidad; medir victorias, vida y duración por enemigo/cadena.
   Repetir la muestra de 200 seeds del baseline y validar en otra muestra fija.
   Una combinación que iguale o supere todas las demás en todos los escenarios
   relevantes obliga a revisar los candidatos. La banda 50–75 %/techo 3 % se conserva
   como regresión del equipo vacío; no se impone a ciegas a las builds equipadas.
3. **Autoridad:** objeto no poseído, ranura incorrecta, usuario ajeno y escritura
   directa rechazados; cambiar en otra pestaña no altera un combate iniciado;
   equipar/iniciar concurrentes producen un snapshot coherente; reintentos conservan
   snapshot, resultado, botín y multiplicador. Reintentos de resolución no vuelven a
   sortear calidad ni entregan otra copia. Inventario anterior y copias permanecen intactos.
4. **Historia:** pruebas normativas de todas las versiones y resolución/replay de
   filas antiguas abiertas y resueltas. Cambiar el catálogo visible no cambia un replay.
5. **UI:** ganar → comparar → equipar → entrenamiento con efecto → reanudar aventura
   antigua con su equipo original. Vacíos, error/reintento, teclado, móvil y movimiento
   reducido. E2E con dos cuentas contra build de producción.
6. **Producto:** el usuario entiende la comparación y desea probar un objeto nuevo;
   el efecto se percibe en combate. La simulación no sustituye esta aceptación.

## 8. Orden de implementación y cierre

Tras revisar este diseño: motor candidato y medición de balance; persistencia atómica
y matriz SQL; integración de servicios; selección/comparación; arte y VFX; verificación
completa y aceptación jugable. El plan detallado se escribe sobre la spec revisada.

**Concreción para el plan (#1123):** identidad de copia = UUID de la fila ganada;
recompensas antiguas proyectadas a potencia neutral sin reescribirlas; nuevas copias
con calidad guardada. El rango inicial propuesto para calibrar es ×0,8/0,9/1/1,1/1,2,
aplicado solo al efecto del objeto. La calidad de una oportunidad es estable por
usuario/día y no depende del intento. El usuario confirmó una recompensa por aventura
vinculada al uso de la app, sin más botín ni resorteos al repetir combates. La utilidad
de tinta se sigue aparte en #1134 y no entra por defecto en R4b.

R4b permanece en #1123 hasta completar todo el contrato. Al implementar se actualizan
modelo de datos, backlog, Parte II, grafo y decisiones append-only. Cualquier límite
nuevo que se acepte queda en una issue con área, tipo y prioridad. Esta propuesta no
marca el hito como implementado ni publica cambios de motor o esquema.
