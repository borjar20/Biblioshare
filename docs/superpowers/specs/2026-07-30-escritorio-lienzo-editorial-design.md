# Lienzo editorial para vistas de escritorio

Fecha: 2026-07-30  
Estado: aprobado, pendiente de implementación

## Objetivo

Reducir el vacío visual de Biblioshare en pantallas de escritorio sin convertir la aplicación en un dashboard genérico. Las vistas principales dejarán de limitarse de forma inconexa a `max-w-2xl` o `max-w-4xl`: desde `lg` usarán un lienzo editorial amplio, con el contenido de la tarea a la izquierda y un raíl contextual útil a la derecha.

La referencia validada es el prototipo de la dirección A: contenido con prioridad de lectura, bloque de continuidad personal bajo el título y raíl con información que evita repetir el cuerpo.

## Alcance

- Solo escritorio amplio (`lg` en adelante); móvil y tableta conservan la columna actual.
- Primera entrega para las vistas de más uso: Inicio (`/`), Mi Biblioteca (`/coleccion`) y Estadísticas (`/estadisticas`).
- El chrome superior, los datos de dominio, el esquema, RLS y las acciones existentes no cambian.
- Ningún raíl será global o decorativo: su contenido depende de la página.

Quedan fuera fichas de obra, páginas de saga y editores: ya tienen composiciones propias y se evaluarán después, con una maqueta específica si fuera necesario.

## Dirección visual

El lienzo máximo de escritorio será aproximadamente 1.280 px, con 28--32 px de separación entre:

1. columna principal flexible (mínimo 0; ocupa el resto), y
2. raíl de 280--320 px, separado por una regla vertical tenue.

La cabecera y cualquier bloque de continuidad atraviesan ambas columnas. Debajo, la columna principal conserva el ritmo existente de listas, grids y filtros. El raíl puede ser `sticky` bajo la topbar cuando su contenido lo justifique; no se hace sticky en formularios largos ni cuando genere contenido recortado.

El aspecto continúa el lenguaje Paper existente: serif para titulares y obras, mono/versalitas para rótulos de sección, reglas finas, acento cálido y superficies planas. El raíl gana densidad por agrupación y jerarquía, no por tarjetas apiladas ni métricas inventadas.

## Composición por ruta

| Ruta | Columna principal | Raíl de contexto |
| --- | --- | --- |
| `/` | Bloque «Qué has disfrutado hoy», filtros y actividad del feed. | Continuidad de los pases activos y resumen breve de la semana. Reutiliza los datos de progreso/estadísticas ya disponibles; no duplica eventos del feed. |
| `/coleccion` | Pestañas, colecciones, filtros y grids de portadas. | Accesos a colecciones, resumen de biblioteca y filtros persistentes cuando estén activos. En `todo`, los filtros siguen sobre la rejilla: el raíl no sustituye controles existentes sin validación posterior. |
| `/estadisticas` | Selector de periodo y mosaico de gráficas. | Periodo activo, pulso anual y anclas a las secciones de la página. No duplica las métricas ya visibles como tarjetas. |

En una página sin contenido suficiente para el raíl, se mantiene una sola columna amplia en lugar de rellenarlo con recomendaciones o copy de marketing.

## Arquitectura de UI

Se introducirá una composición compartida, por ejemplo `DesktopEditorialLayout`, puramente presentacional. Recibe `header`, `focus`, `main` y `rail`; aplica el cambio de una a dos columnas solo en escritorio. Cada ruta sigue siendo propietaria de sus consultas y decide qué entra en el raíl, por lo que el layout no conoce Supabase ni tipos de dominio.

Los bloques de raíl se extraerán solo cuando se repitan o tengan una responsabilidad clara. Los componentes actuales (`TodayBlock`, `StatsRail`, `CollectionSummary`, filtros y tarjetas de estadísticas) se reaprovechan o se ajustan: no se recrea información calculada en paralelo.

Los skeletons deben reflejar exactamente la nueva composición de su ruta para evitar salto de layout durante el streaming. El contenido de raíl que dependa de datos lentos va dentro de su propio `Suspense`; el shell y la columna principal deben poder pintar antes.

## Estados y accesibilidad

- Con viewport inferior a `lg`, `main` y `rail` se apilan; el contenido del raíl queda después del principal, o se omite si solo es contexto redundante.
- Los rails vacíos no reservan una columna.
- Los enlaces y acciones del raíl conservan sus destinos y nombres actuales; no se introducen iconos sin etiqueta.
- El orden de tabulación sigue el orden visual y de lectura: cabecera, foco, principal y después raíl.
- Se mantienen contraste, foco visible y `prefers-reduced-motion` del sistema actual.

## Datos, errores y rendimiento

No hay migraciones ni contratos de servidor nuevos. Cada dato procede de los lectores ya usados por la ruta o de una consulta adicional solo si el raíl no puede alimentarse de ellos. Las consultas independientes se lanzan en paralelo y los fallos del raíl degradan a su skeleton/ausencia sin impedir el contenido principal. No se añade estado de cliente para una composición que puede resolverse en servidor.

## Verificación

1. Pruebas de render que comprueben que el layout recibe y ordena `header`, `focus`, `main` y `rail`, y que no reserva rail cuando no existe.
2. E2E de escritorio para Inicio, Biblioteca y Estadísticas: la columna principal y el raíl son visibles, los controles existentes funcionan y no hay overflow horizontal.
3. E2E de móvil/tableta: una sola columna, navegación y acciones iguales a la línea base.
4. Revisión visual en 1280 px, 1440 px y 1920 px, además de 768 px y 390 px, tanto en tema claro como oscuro.
5. Comprobación de CLS con los skeletons de Inicio y de que la topbar no cubra un raíl sticky.

## Decisiones explícitas

- No existe un ancho global único aplicado a toda la app: el componente ofrece un patrón común, pero el máximo puede ser menor en pantallas cuya tarea sea lectura o formulario.
- No se cambia el comportamiento móvil para «llenar» escritorio.
- No se añade una barra lateral de navegación. El raíl es contextual a cada vista y no compite con la navegación superior existente.
- No se abre una migración, issue de datos ni cambio de i18n en esta fase de diseño.
