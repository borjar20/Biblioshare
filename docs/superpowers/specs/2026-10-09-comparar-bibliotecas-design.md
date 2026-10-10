# Comparar bibliotecas: Obras y Gustos

> [Histórico · corte de conversación 2026-10-09] Propuesta de producto para revisión.
> Registra lo acordado durante el brainstorming y distingue las propuestas aún por
> concretar. No es una especificación técnica lista para implementar ni describe una
> funcionalidad existente. El seguimiento operativo vive en
> [#1462](https://github.com/borjar20/Biblioshare/issues/1462); el estado de la feature,
> en `docs/requirements/backlog.md`.

## 1. Intención

Hacer visible cómo se relaciona culturalmente un grupo de amigos: qué obras comparten,
qué conexiones aparecen entre algunos de ellos y en qué coinciden o discrepan sus
preferencias. La experiencia parte del grupo completo y permite profundizar en una
pareja o un trío, incluyendo comparaciones entre amigos sin el dueño de la selección.

El éxito de producto consiste en que una persona pueda encontrar una conexión,
entender qué significa y abrir las obras que la justifican. La afinidad se expresa
mediante hallazgos concretos, sin una puntuación global de compatibilidad.

## 2. Acuerdos de la conversación

| Tema | Acuerdo |
|---|---|
| Unidad de entrada | Grupo completo de personas seleccionadas |
| Persistencia | Selección personal guardada, con nombre y personas editables |
| Carácter del grupo | Personal; no es un club ni un grupo compartido con invitaciones |
| Detalle | Seleccionar dos o tres personas para explorar sus coincidencias |
| Ámbito inicial | Libros, películas y series juntos; filtro posterior por tipo |
| Secciones | **Obras** y **Gustos**, diferenciadas |
| Afinidad | Hallazgos concretos y explicables; sin porcentaje global en esta propuesta |
| Libros y películas | Recorrido terminado |
| Series | Se admite una excepción para incluir series en curso |
| Pendientes | Posible experiencia separada: «Lo que esperamos juntos» |
| Gustos | Dos señales explícitas: lo consumido y lo que gusta según valoraciones |

La excepción de series sustituye la preferencia anterior de incluir solo lo terminado
en todos los formatos. Su criterio preciso de entrada y progreso sigue en el trabajo
de diseño de #1462; no se ha aprobado un número mínimo de episodios o temporadas.

## 3. Recorrido propuesto

1. Crear o abrir una selección personal guardada.
2. Entrar en **Obras**, con el grupo completo y todos los formatos.
3. Explorar el conjunto o elegir una pareja/trío. El dueño no es obligatorio.
4. Consultar sus cruces, abrir una zona y ver los títulos y notas correspondientes.
5. Cambiar a **Gustos** para explorar conexiones por autores, directores y géneros.
6. Filtrar por formato conservando grupo, participantes seleccionados y sección.

Se propone guardar la composición del grupo y consultar datos actuales al volver;
guardar no congela un retrato histórico. La disponibilidad de perfiles y obras se
resuelve de nuevo según los permisos vigentes del observador.

Como representación inicial se propone un mapa de conexiones del grupo y un Venn al
seleccionar dos o tres personas. El mapa general es una alternativa mostrada durante
la conversación, no una composición visual aprobada. Antes de adoptarlo deben
compararse su legibilidad móvil y la facilidad de selección con una lista o matriz.

Los hallazgos sobre parejas o tríos pueden servir de acceso al detalle. Un hallazgo
del grupo completo abre su evidencia sin intentar convertir un grupo numeroso en un
Venn de muchos círculos. Una intersección global vacía conserva el valor de las
coincidencias parciales.

## 4. Obras: coincidencias concretas

Responde a «¿qué habéis leído/visto y qué os pareció?». Cada elemento del Venn es una
obra. Los acuerdos y desacuerdos de notas sobre títulos concretos permanecen aquí.

| Hallazgo | Evidencia que debe poder abrirse |
|---|---|
| Lo que comparte todo el grupo | Obras presentes en el recorrido visible de todos |
| Coincidencias de una pareja o trío | Obras y participantes de ese cruce |
| Entusiasmo compartido | Títulos y notas altas de las personas mencionadas |
| Acuerdos | Títulos con notas parecidas, incluidas valoraciones poco entusiastas |
| Desacuerdos | Títulos y diferencias de nota, sin resumirlos en compatibilidad global |

La zona «Ana y Luis» de un Venn de tres personas se refiere al cruce exacto dentro de
esa selección; no dice que nadie más del grupo conozca esas obras. La pantalla debe
hacer visible quién está incluido en la comparación.

Una ausencia significa que no hay un registro elegible visible para esa persona;
no demuestra que nunca haya consumido la obra. Una nota ausente no vale cero ni
demuestra desacuerdo.

## 5. Gustos: consumo y valoración diferenciados

Responde a «¿qué intereses y preferencias aparecen en vuestro recorrido?». Puede
encontrar conexiones entre personas que han consumido obras distintas del mismo
autor, director o género. Estas conexiones no alteran las intersecciones de Obras.

Las dos señales tienen rótulos y evidencia distintos:

| Señal | Qué puede afirmar | Qué no puede inferir |
|---|---|---|
| **Lo que consumís** | Presencia, cantidad y reparto de obras de un autor/director/género | Que ese consumo haya resultado satisfactorio |
| **Lo que os gusta** | Cómo se valoran las obras y qué acuerdos o diferencias aparecen | Preferencias de personas que no han valorado esas obras |

Ejemplos ficticios de presentación:

- **Consumo:** «Ana ha leído 6 libros de esta autora; Luis, 3».
- **Valoración:** «En los 4 libros que Ana ha puntuado de esta autora, sus notas van
  de 4 a 5». Luis se describe con sus propias obras valoradas y su propia muestra.
- **Conexión:** «Ambos habéis leído a esta autora, aunque estos títulos no coinciden».

Cada hallazgo identifica personas, ámbito, señal y obras que lo sustentan. La base de
valoración solo incluye notas existentes y se muestra separada del total consumido.
Una persona con consumo y sin notas conserva hallazgos de consumo; la ausencia de
valoraciones se presenta como información insuficiente para esa segunda señal.

Los géneros pueden coexistir en una obra. Una distribución por género debe explicar
su denominador y evitar sugerir que las categorías son partes excluyentes. La
cobertura de metadatos e identidad de creadores limita los hallazgos posibles.

## 6. Propuestas de consistencia para el diseño detallado

Estas reglas concretan la propuesta, pero no sustituyen la revisión pendiente:

- Comparar obras únicas: una relectura, edición o episodio no añade otra obra al
  Venn. Una obra terminada anteriormente puede seguir siendo elegible durante una
  nueva lectura/visionado.
- Mostrar el progreso de las series incluidas. Compartir serie no implica haber
  visto los mismos episodios ni tener valoraciones del mismo momento.
- Mantener la granularidad de las notas: una valoración de episodio no se convierte
  automáticamente en valoración de la serie.
- Mostrar cantidades y bases por persona cuando difiere el tamaño de sus recorridos.
  «Compartís 30 obras» no basta para describir qué representan para cada una.
- Mantener los mismos criterios de elegibilidad y permisos entre cifras, gráfico,
  listas e información que respalda cada hallazgo.
- Presentar poca evidencia, falta de notas y falta de metadatos como estados
  diferentes. Un error de carga no produce un hallazgo de «ninguna coincidencia».

## 7. Encaje y restricciones del proyecto

La lectura inicial del mapa de arquitectura y del código local sitúa las bases en
`src/lib/library/get-library-items.ts`, `src/lib/passes/`, `src/lib/social/follows.ts`
y el catálogo. Es orientación para el siguiente diseño, no una auditoría de
viabilidad ni de producción.

Se mantienen las reglas del repositorio: estado vivo en `passes`, visibilidad
vigente del observador y ninguna caché compartida de resultados dependientes de la
sesión. Guardar una selección no concede permisos sobre los perfiles incluidos.
Contadores, conexiones y hallazgos deben respetar las mismas restricciones que las
obras subyacentes.

Esta propuesta no fija tablas, RPC, rutas, algoritmos de puntuación ni librerías de
visualización. Tampoco requiere cambios de esquema o de código en esta fase.

## 8. Trabajo de diseño registrado en #1462

Antes de redactar un plan de implementación se necesita:

1. Revisar esta propuesta de producto y elegir la composición general de Obras y Gustos.
2. Precisar elegibilidad de series, casos de importación y notas en distintos momentos.
3. Elegir la nota representativa de una obra con varias lecturas/visionados.
4. Definir cada hallazgo: umbral, mínimo de evidencia, denominador, orden y texto.
5. Comprobar cobertura e identidad de autores, directores y géneros en el catálogo.
6. Fijar límites de grupo, selección de perfiles, navegación y accesibilidad móvil.
7. Diseñar persistencia privada, consultas, errores y verificación con varias cuentas.

La posible experiencia «Lo que esperamos juntos» queda como idea separada, también
rastreada en #1462 hasta decidir si merece un diseño propio. No se mezcla con los
conjuntos del recorrido consumido.

## 9. Evidencia de esta fase

Se exploró en conversación un esquema interactivo con seis personas y películas
ficticias. Permite seleccionar pareja/trío, abrir zonas y consultar notas. Se
comprobó su lógica de selección y recuentos en un entorno DOM simulado; no se hizo
verificación visual en un navegador real ni integración con Biblioshare.

Ese esquema es material de debate. Precede a la separación Obras/Gustos y no fija
el estilo visual, los umbrales o la fórmula de afinidad de la futura feature.

## 10. Acuerdo posterior del 2026-10-10: obras elegibles

Tras validar el diseño visual de la maqueta, el usuario acepta la propuesta de:

- Incluir libros y películas terminados al menos una vez.
- Incluir series desde el primer episodio visto, también si se abandonaron;
  mostrar su estado y progreso sin equiparar recorridos de distinta extensión.
- Contar cada obra una vez por persona, sin duplicarla por relecturas o visionados.
- Excluir los pendientes de esta comparación.

Este acuerdo concreta la excepción de series de §2 y la deduplicación de §6.
La regla de compatibilidad para registros históricos/importados sin episodios
detallados y las valoraciones representativas siguen pendientes dentro de #1462.
La aprobación visual y sus iteraciones constan en
[la historia del mockup](2026-10-10-entre-nosotros-mockup.md).

## 11. Acuerdo posterior del 2026-10-10: nota de libros y películas

El usuario aprueba que la nota representativa sea la de la última lectura o
visionado terminado visible para quien consulta. Un 8 anterior y un 6 posterior
se comparan como 6, sin promediar ambos recorridos. Si el último terminado no
tiene nota, se muestra «Sin valorar»; no se recupera una valoración antigua.
Una relectura o nuevo visionado en curso conserva la nota del último terminado.

Este criterio concreta §8.3 para libros y películas. El orden de los registros
importados sin fecha y el criterio de notas de series se mantienen en el diseño
pendiente de #1462; no se toma la fecha de importación como fecha de consumo.
