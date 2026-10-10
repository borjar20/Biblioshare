# Entre nosotros: comparación de bibliotecas

> [Histórico · corte de diseño 2026-10-10] Especificación consolidada para revisión.
> Recoge los acuerdos de producto y el diseño visual aprobado, y distingue las
> propuestas nuevas que requieren revisar este documento. No acredita implementación.
> Seguimiento: [#1462](https://github.com/borjar20/Biblioshare/issues/1462).
> Estado de la feature: [backlog](../../requirements/backlog.md).

## 1. Propósito y alcance acordados

Descubrir qué conecta culturalmente a un grupo de amigos: las obras que comparten
y las coincidencias o diferencias entre sus gustos. Cada hallazgo debe permitir
abrir las obras y valoraciones que lo justifican. No habrá un porcentaje global de
compatibilidad ni se confundirá consumir mucho con valorar bien.

La entrada es una selección personal guardada, formada por personas seguidas.
El tamaño habitual previsto por el usuario es **5–10 personas**. Esta previsión
no fija por sí sola un límite obligatorio. El mapa muestra el grupo completo y
permite seleccionar dos o tres personas para abrir un Venn detallado.

Hay dos secciones: **Obras**, para títulos concretos y sus notas; y **Gustos**, para
géneros y creadores. Ambas parten de libros, películas y series juntos, con filtro
posterior por formato. «Lo que esperamos juntos» queda fuera de estos conjuntos
y continúa como idea separada en #1462. No se añaden invitaciones, notificaciones,
grupos colaborativos ni recomendaciones automáticas.

## 2. Personas, grupos y visibilidad

**Acordado:** para añadir a otra persona se exige un seguimiento aceptado del dueño
hacia ella; no hace falta reciprocidad. Los perfiles públicos no seguidos y las
solicitudes pendientes quedan fuera del selector. El dueño puede incluirse, pero
también puede comparar únicamente a otras personas. Las selecciones son privadas.

**Propuesta de funcionamiento:** guardar grupos de **2 a 10 participantes**, contando
al dueño si está incluido. Se pueden guardar varias selecciones con nombre y editar
sus participantes. El mapa no intenta dibujar un Venn de diez círculos: sus enlaces
muestran coincidencias entre parejas; el Venn se limita siempre a dos o tres.

**Propuesta de persistencia:** guardar nombre, orden y participantes en la cuenta;
recalcular los datos visibles al abrir el grupo. Se elige esta opción frente a
guardarlo solo en el dispositivo, que perdería continuidad entre dispositivos, y
frente a guardar copias de bibliotecas, que introduciría datos desactualizados y
duplicaría información sujeta a permisos.

Guardar una persona no concede acceso a su biblioteca. En cada carga o cambio de
grupo se validan seguimiento y visibilidad actuales. Si alguien deja de estar
disponible, se indica «Persona no disponible», sin consultar su recorrido ni
convertirlo en una biblioteca vacía. Se ofrece editar la selección; las afirmaciones
sobre todo el grupo quedan suspendidas mientras falten participantes. Es posible
explorar una pareja o trío disponible, identificando claramente a sus integrantes.
La selección guardada no se borra silenciosamente.

## 3. Obras elegibles y notas acordadas

La identidad de una obra es su tipo y su identificador de catálogo. Ediciones,
relecturas y nuevos visionados no multiplican su presencia en los conjuntos.

| Tipo | Entra en Obras | Valoración representativa |
|---|---|---|
| Libro | Al menos una lectura terminada visible | Nota de la última lectura terminada |
| Película | Al menos un visionado terminado visible | Nota del último visionado terminado |
| Serie | Al menos un episodio visto visible, también si se abandonó | Nota general explícita, acompañada de estado y progreso |

Un libro valorado con 8 y después con 6 se compara como 6. Si el último recorrido
terminado carece de nota, se muestra «Sin valorar», sin recuperar una nota anterior.
Una relectura o revisión en curso conserva la nota del último recorrido terminado.
Los pendientes no añaden obras; un nuevo pase pendiente tampoco elimina una obra
que ya cumplía los requisitos por su historial.

Las series conservan dos señales separadas: la nota general explícita y las notas
de episodios. Una comparación de episodios solo usa los vistos y puntuados por
todas las personas mencionadas, y muestra cuántos sustentan la comparación. Para
una pareja puede decir «Coincidencias en 6 episodios»; no representa una valoración
de toda la serie. Compartir título no implica compartir progreso.

### Propuestas para resolver historial e importaciones

- **Fechas desconocidas:** los terminados sin fecha siguen contando como consumo.
  Para elegir una nota se prioriza la fecha de fin conocida; en empate, la fecha
  de registro y después el identificador. Los pases sin fecha de fin se ordenan
  detrás de los fechados y, entre sí, por registro e identificador. Es el criterio
  determinista del helper actual, aplicado aquí solo a pases terminados. Si hay
  varios pases y alguno no tiene fecha, se explica «Orden histórico incompleto»;
  la fecha de importación nunca se presenta como fecha de consumo.
- **Nota general de serie:** usar el pase activo en curso cuando exista; en su
  ausencia, el último pase cerrado, terminado o abandonado. Un pase pendiente no
  sustituye esta referencia. Si el pase elegido carece de nota general, se muestra
  «Sin valorar», sin buscar notas antiguas ni promediar episodios.
- **Episodios repetidos:** cada episodio cuenta una vez por persona. Su nota es la
  del último registro visible, ordenado por fecha de visionado, fecha de registro
  e identificador; los valores de fecha desconocida se sitúan detrás de los
  conocidos. Una nota nula del registro elegido no recupera otra anterior.
- **Series históricas:** un episodio visible con `pass_id` nulo prueba consumo y
  cuenta para los episodios vistos alguna vez. No se asigna a un visionado actual
  inventado. Una serie marcada terminada sin ningún episodio registrado queda
  fuera del Venn en esta primera versión; se explica esta limitación de cobertura.
  No se deduce una temporada completa de una posición o de un estado heredado.
- **Progreso:** distinguir «vistos alguna vez» del progreso del visionado actual.
  Si no puede reconstruirse este último, mostrar «Progreso no disponible». Los
  denominadores de episodios emitidos siguen las reglas existentes de series.

Estas propuestas concretan casos que no quedaban cerrados con la aprobación visual.
No modifican ni reparan automáticamente los registros originales.

## 4. Obras: conjuntos y hallazgos

**Acordado:** las regiones del Venn son exactas respecto a la pareja o trío activo.
En un trío, «Ana y Luis» excluye las obras también presentes en el recorrido elegible
de la tercera persona. No excluye coincidencias con otros miembros del grupo que
no estén en esa selección. Los nombres activos siempre permanecen visibles.

Una ausencia significa «sin registro elegible visible», nunca «no lo ha leído/visto».
Los recuentos usan obras únicas y no dependen de que tengan nota. Las zonas vacías
mantienen el cero y una explicación. El área de los círculos y la posición del mapa
son esquemáticas; los números expresan las cantidades.

Los umbrales aprobados para una misma obra, en escala de 1 a 10, son:

| Hallazgo | Condición para todas las personas mencionadas |
|---|---|
| Os encantó | Cada nota es mayor o igual que 8 |
| Notas parecidas | Nota máxima menos mínima menor o igual que 1 |
| Diferencia de opinión | Nota máxima menos mínima mayor o igual que 3 |

Cada afirmación identifica personas y notas. Las notas ausentes no son cero; se
excluyen de afirmaciones que necesitan esa valoración. La coincidencia en notas
bajas expresa acuerdo, no entusiasmo. Una obra puede cumplir más de un criterio.

**Propuesta de presentación:** en el mapa, mostrar primero obras compartidas por
todo el grupo y después conexiones de parejas. Ordenar estas conexiones por número
de obras comunes, con desempate por el orden guardado de participantes. En el Venn,
mantener los tres tipos de hallazgos como filtros explícitos sobre la selección
activa; ordenar sus obras por título e identificador. Las muestras de las pilas
usan ese mismo orden estable. Así un cambio de carga no cambia la portada destino.
Un filtro de notas que deje el conjunto vacío conserva el recuento de consumo base
y explica por qué no hay hallazgos de ese tipo.

## 5. Gustos: dos señales con evidencia

**Acordado:** diferenciar «Lo que consumís» de «Lo que os gusta según vuestras notas».
Las conexiones pueden aparecer aunque las personas hayan consumido títulos distintos
del mismo género, autor o director. No cambian los conjuntos de Obras.

Una tendencia de valoración exige al menos **tres obras únicas valoradas por cada
persona mencionada**, dentro del ámbito mostrado. Los episodios no cuentan como
obras adicionales. Con una o dos obras se muestran notas concretas sin generalizar.
Los recuentos de consumo siguen disponibles aunque no haya ninguna nota.

**Propuesta de cálculo y presentación:**

- Consumo: cantidad de obras elegibles por persona y categoría, junto a su total
  elegible. Si se muestra proporción, su denominador es ese total bajo el filtro
  de formato actual. Una obra puede tener varios géneros: sus porcentajes no son
  partes excluyentes ni tienen por qué sumar 100 %.
- Valoración: media aritmética de las notas representativas, con un decimal,
  rango, número de obras puntuadas y acceso a esas obras por persona. Un libro
  releído cinco veces sigue aportando una sola nota.
- Con muestra suficiente se comparan esas medias y sus bases como datos explícitos,
  sin trasladar automáticamente los umbrales de «Os encantó» a una categoría.
  No se añade una puntuación global ni se afirma acuerdo sobre títulos distintos.
- Orden: categorías comunes a más participantes primero; en empate, mayor mínimo
  de obras por participante incluido y después nombre e identificador. En la señal
  de valoración se cuentan únicamente obras puntuadas. Los detalles muestran las
  bases individuales, incluso cuando la muestra sea insuficiente para una tendencia.
- Géneros: usar el vocabulario canónico del catálogo. Creadores: usar identidades
  de `people`/`credits` y su rol de autor o director, sin unir por texto de nombre
  ni equiparar director y creador de una serie.
- La cobertura se muestra sobre los datos cargados: por ejemplo, «Género disponible
  en 18 de 23 obras». La falta de metadatos no demuestra falta de interés. No se
  inventan categorías ni se desencadena una escritura de catálogo al comparar.

## 6. Experiencia visual aprobada

La referencia es la versión 14 del
[mockup publicado](https://biblioshare-entre-nosotros.borjar20.chatgpt.site/), con su
[historial y evidencia](2026-10-10-entre-nosotros-mockup.md). Conservar la paleta de
Biblioshare —crema, espresso y terracota— y el carácter expresivo de la maqueta.

- Mapa del grupo → Venn de dos o tres personas, con portadas reales viajando a sus
  cruces y regreso simétrico a la pila. Duración de referencia: 850 ms.
- Dentro del Venn, tres niveles: **general → cruce completo → obra**. Rueda y clic
  avanzan por niveles fijos. La obra seleccionada es el destino real de la cámara.
- El cruce despliega sus portadas dentro del lienzo. Al entrar en una obra, las
  demás permanecen detrás y difuminadas; volver recorre la transformación inversa.
  General/cruce/obra coordinan cámara, portadas y altura durante 720 ms.
- Sin arrastre libre, desplazamiento por flechas, modales ni paneles laterales para
  explorar evidencia. En móvil crece la altura del lienzo y se usa el scroll normal
  de la página. Las zonas vacías no ofrecen un acercamiento a una portada ficticia.
- Las transiciones interrumpidas continúan desde la posición visible. Se respeta
  movimiento reducido; entender el contenido no depende de observar la animación.

**Propuestas de accesibilidad y escala:** botones equivalentes para todos los
recorridos, etiquetas de región y cantidad, foco de regreso al control de origen
y selección que no dependa solo del color. Un gesto de rueda no debe atravesar
varios niveles por inercia; fuera del lienzo no se intercepta el scroll. En móvil
se opera con toque. Las colecciones grandes conservan recuentos completos y cargan
portadas progresivamente, con un control «Cargar más» dentro del cruce; abrir una
obra mantiene su posición y volver restaura la colección y la posición de página.

## 7. Integración propuesta en Biblioshare

La exploración del repositorio respalda estas fronteras, todavía sin implementar:

| Unidad | Responsabilidad y contrato |
|---|---|
| Entrada en Comunidad | Ruta autenticada `/comunidad/entre-nosotros`, accesible desde Comunidad; carga grupos propios y candidatos válidos |
| Persistencia privada | Grupo con dueño, nombre y revisión; miembros con identidad y orden. Solo el dueño puede leer o modificar la selección |
| Lectura de comparaciones | Recibe observador autenticado, grupo y formato; valida participantes, consulta datos visibles y entrega obras normalizadas y cobertura |
| Dominio `src/lib/comparisons/` | Funciones puras de elegibilidad, nota representativa, conjuntos, facetas y hallazgos; no dependen de la cámara ni modifican catálogo |
| UI `src/components/comparisons/` | Selector y edición de grupos, Obras/Gustos y lienzo con estados explícitos; consume el resultado autorizado y mantiene identidades estables |

Propuesta de tablas: `comparison_groups` y `comparison_group_members`, con RLS
del dueño, permisos explícitos y unicidad de miembro por grupo. Guardar nombre y
miembros es una operación atómica que valida tamaño y seguimientos en el servidor.
Una revisión evita que dos pestañas sobrescriban cambios sin aviso. Las migraciones,
grants y contratos concretos se detallarán en el plan y se probarán primero en dev.

Los datos personales se leen con la sesión del observador, sin `service_role` ni
caché compartida de resultados. Guardar una lista de miembros no permite
eludir la visibilidad de sus fuentes. Los filtros, recuentos y notas usan la misma
base autorizada; no se obtienen totales de filas ocultas. Reseñas, motivos de
abandono y otros textos privados no forman parte de este contrato.

`passes` es la fuente de estado y notas generales; `episode_watches`, la de episodios.
Los helpers actuales de último pase cerrado y notas de episodios requieren adaptar
sus criterios: los primeros también admiten abandonados y los segundos pueden
incluir varios visionados de un episodio. No se reutilizan sin deduplicación y
filtrado específicos. Las lecturas deben paginar todos los registros necesarios;
el límite de una consulta no puede convertirse en el total de una biblioteca.

La carga distingue pendiente, completo, vacío, participante no disponible y error.
Un fallo de consulta nunca produce un cero ni un hallazgo parcial presentado como
completo. Al cambiar de grupo o formato se descartan respuestas de la petición
anterior; al cambiar de cuenta se elimina su estado personal de cliente. La ausencia
o fallo de una portada permite usar un sustituto visual sin retirar la obra.

## 8. Criterios de aceptación para la implementación

Estos criterios corresponden al diseño propuesto; se ajustarán si cambia durante
la revisión del documento.

1. Crear, editar, abrir y borrar una selección privada; validar 2–10 participantes
   en cliente y servidor. Rechazar perfiles no seguidos o solicitudes pendientes.
2. Comparar parejas y tríos, incluido un grupo sin su dueño. Verificar cruces
   exactos, filtro de formato, deduplicación y una intersección global vacía con
   coincidencias parciales disponibles.
3. Probar relecturas, abandonados, notas nulas, fechas desconocidas, episodios
   repetidos, filas históricas sin pase y series sin detalle de episodios. Mantener
   separados vistos alguna vez, progreso actual, nota general y notas de episodios.
4. Comprobar los límites 8, 1 y 3 de los hallazgos por obra y el mínimo de tres obras
   por persona en tendencias. Notas bajas similares no se presentan como entusiasmo.
5. Verificar con varias cuentas grupos privados, acceso vigente, seguimiento
   revocado y visibilidad de fuentes. Ni respuestas, recuentos ni cachés revelan
   datos que el observador no puede consultar. Probar aislamiento y grants de tablas.
6. Probar bibliotecas que excedan una página de consulta, metadatos incompletos,
   errores, cambios rápidos de grupo/formato y dos pestañas editando la selección.
7. Verificar en navegador grupos de diez, 320 px, claro/oscuro, títulos largos,
   portadas ausentes, teclado y movimiento reducido. Observar fotogramas intermedios
   de ambos sentidos, interrupciones y rueda con inercia; contar animaciones iniciadas
   no acredita continuidad visual. Probar el recorrido también con build de producción.

Esta fase ha revisado documentación y código local. No ha auditado la cobertura de
metadatos en producción ni probado consultas reales de esta feature. La evidencia
del mockup acredita su interacción con datos ficticios, no la implementación futura.
El alcance pendiente permanece en #1462; esta especificación no cierra la issue.

## 9. Revisión de esta propuesta

El tamaño habitual de 5–10 se añade a los acuerdos previos. El límite inicial de
diez, persistencia en la cuenta, tratamiento detallado del historial, presentación
de medias por categoría e integración de §7 son **propuestas nuevas**, no decisiones
ya aprobadas. Revisar esta versión permite preparar después un plan de implementación.

Fuentes locales contrastadas: [modelo de datos](../../requirements/data-model.md),
[mapa de arquitectura](../../architecture/graph.json), `src/lib/social/follows.ts`,
`src/lib/community/latest-rating.ts`, `src/lib/library/get-library-items.ts`,
`src/lib/series/get-episode-data.ts`, `src/lib/catalog/genre-vocab.ts` y
`src/app/comunidad/page.tsx`. El [primer diseño](2026-10-09-comparar-bibliotecas-design.md)
y el historial visual conservan la evolución de las decisiones.
