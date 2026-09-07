# S3 — Madriguera del club

> Spec confirmada · 2026-09-07. Tres rondas aceptadas y confirmación final de José Ángel. Implementación pendiente.

## Problem Statement

La madriguera personal muestra mascotas de los seguidos, pero el club no tiene un espacio equivalente de compañía. Sus miembros deben seguirse individualmente o visitar perfiles para descubrir las mascotas visibles del grupo. S3 lleva esa presencia al feed sin convertirla en competición ni alterar la privacidad.

## Solution

Mostrar una «Madriguera del club» con el nombre del club y los sprites actuales, debajo del resumen de actividades del feed: lateral en escritorio y arriba en móvil. Bloque secundario, sin pestaña nueva, reservado a miembros activos y sujeto a la visibilidad de cada perfil.

Participación automática. Mascotas en idle con nombre, clase, etapa, nivel y dueño; tarjeta y enlace al perfil. Hasta doce inicialmente, propia primero cuando existe. «Mostrar más» expande hasta sesenta vecinas; «Mostrar menos» recupera el tamaño inicial. Si hay más se explica el límite usando solo el total visible.

## User Stories

1. Como miembro activo, quiero ver las mascotas visibles del club para sentir la presencia del grupo.
2. Como miembro de varios clubes, quiero reconocer la misma mascota en cada grupo al que pertenece su dueño para mantener una identidad común.
3. Como miembro, quiero reconocer el nombre del club en la escena para identificar el grupo.
4. Como dueño, quiero participar automáticamente para no configurar cada club.
5. Como miembro, quiero ver mascotas de miembros públicos aunque no los siga para descubrir a mis compañeros.
6. Como dueño de un perfil privado, quiero conservar su privacidad dentro del club para elegir quién ve mi mascota.
7. Como persona que bloquea o es bloqueada, quiero que ambas mascotas queden ocultas entre esas cuentas para respetar el bloqueo.
8. Como miembro, quiero recuentos limitados a mascotas visibles para no revelar presencias ocultas.
9. Como miembro, moderador o propietario activo, quiero el mismo acceso para que el rol no amplíe la privacidad ajena.
10. Como invitado o solicitante, quiero acceder solo al convertirme en miembro activo para mantener la escena dentro del club.
11. Como exmiembro, quiero que las nuevas consultas no me permitan acceder ni incluyan mi mascota para respetar la salida del grupo.
12. Como miembro sin mascota, quiero consultar la escena para disfrutarla antes de eclosionar.
13. Como dueño de una bellota, quiero que aparezca conforme a las mismas reglas para participar desde el comienzo.
14. Como dueño, quiero mi mascota primero y dentro de las doce plazas iniciales para localizarla fácilmente.
15. Como miembro, quiero consultar nombre, clase, etapa, nivel y dueño al tocar una mascota para reconocerla.
16. Como miembro, quiero abrir el perfil del dueño desde su tarjeta para conocerlo mejor.
17. Como dueño, quiero mantener ocultos humor y actividad reciente para no revelar mis hábitos de uso.
18. Como miembro, quiero un orden diario estable sin clasificación por nivel para reconocer la escena sin competir.
19. Como miembro de un club grande, quiero expandir hasta sesenta vecinas y conocer el total visible cuando se supere el límite para entender qué estoy viendo.
20. Como lector del feed, quiero contraer la escena para volver cómodamente a las conversaciones.
21. Como miembro sin mascotas visibles, quiero un mensaje vacío claro y enlace a mi mascota para entender el estado.
22. Como miembro, quiero usar el club aunque las mascotas tarden o fallen para continuar con mis actividades.
23. Como miembro, quiero distinguir un fallo de una escena vacía y reintentar para recuperar el contenido.
24. Como miembro, quiero permisos actuales en cada nueva consulta para recibir solo contenido autorizado.
25. Como miembro que cambia membresía o visibilidad, quiero refrescar las vistas afectadas tras mis acciones para reflejar el cambio.
26. Como usuario móvil o de escritorio, quiero un bloque secundario adaptado a mi pantalla para conservar el protagonismo del club.
27. Como usuario de teclado, quiero abrir tarjetas, expandir, contraer y reintentar sin ratón para usar toda la sección.
28. Como usuario con movimiento reducido, quiero que la escena respete mi preferencia para consultarla cómodamente.

## Implementation Decisions

- Reutilizar escena, sprites y tarjetas de S1. Separar la obtención de miembros del club de la presentación compartida; conservar el comportamiento de S1 y S2.
- Integrar solo en el feed, debajo del resumen de actividades. Lectura y carga independientes para no bloquear el resto del club; sin pestaña nueva.
- Exigir membresía activa tanto al observador como al dueño de cada mascota en el club solicitado. Propietario y moderadores no tienen excepciones. Excluir invitaciones, solicitudes y exmiembros.
- Aplicar la visibilidad vigente de perfil y bloqueo bidireccional. Compartir club no concede acceso adicional a perfiles privados. No exigir seguimiento para miembros públicos.
- Usar lectura de servidor/RPC específica del club, con identidad de sesión y comprobación de permisos dentro de la frontera de datos. Devolver solo apariencia acordada e identidad mínima para mostrar al dueño y enlazar su perfil. Mantener el estado de mascota privado del dueño, sin abrir una política general de lectura social.
- No compartir caché entre cuentas ni servir esta lectura con identidad de servicio. Los nombres concretos de funciones y la migración se resolverán en implementación. No añadir persistencia de madrigueras ni preferencias por club.
- Doce plazas iniciales: propia y hasta once vecinas, o hasta doce vecinas sin propia. Máximo expandido: sesenta vecinas más la propia cuando exista. El total de vecinas excluye propia y mascotas ocultas. Selección y total usan los mismos filtros.
- Propia primero y mezcla diaria determinista del resto. Nivel guardado como en S1, sin ordenar por nivel. Incluir bellotas y mantener idle, sin humor ni actividad reciente.
- «Mostrar más» expande contenido cargado y «Mostrar menos» contrae. Si hay más de sesenta vecinas visibles, explicar el límite sin prometer paginación adicional.
- Mantener sección antes de eclosionar y cuando esté vacía. Texto: «Todavía no hay mascotas visibles en esta madriguera», con enlace a la mascota propia y sin cantidades ocultas.
- Fallo: «No hemos podido cargar la madriguera» y «Reintentar». Nunca representar errores como vacíos; reintentar vuelve a comprobar permisos.
- Aplicar permisos actuales en cada nueva consulta y refrescar vistas afectadas tras acciones propias pertinentes. Sin tiempo real: otras pantallas abiertas pueden conservar lo cargado hasta actualizarse. Perder acceso impide nuevas lecturas, no borra datos ya mostrados.
- Ocultar la compañera flotante conserva su significado actual y no es ocultación social.

## Testing Decisions

La frontera principal será el recorrido completo de un miembro en el feed, con cuentas y membresías controladas. Las comprobaciones directas de la lectura autorizada complementan el recorrido: ocultar la sección no basta para demostrar permisos. Estas dos superficies corresponden a las pruebas con distintas cuentas y matriz de permisos ya aceptadas en la entrevista.

Probar comportamiento observable, no estructura interna, helpers ni orden incidental de consultas. Precedentes: E2E de madriguera S1/S2, matriz SQL de lectura de mascotas y E2E del directorio de miembros. Reutilizar patrones de fixtures y limpieza; no depender de clubes reales preexistentes.

### Matriz de aceptación

1. Acceso: miembro, moderador y propietario activos; denegación a visitante, invitado, solicitante y exmiembro, en clubes públicos y privados.
2. Visibilidad: propia, público no seguido, privado con seguimiento aceptado, privado sin aceptación y bloqueos bidireccionales. Filtrar filas y total antes de devolver datos.
3. Pertenencia: solo miembros del club solicitado; nuevas lecturas reflejan altas y salidas. Una mascota puede aparecer en varios clubes sin duplicarse dentro de una escena.
4. Apariencia: campos acordados, bellota, nivel, tarjeta y perfil; ausencia de humor y actividad reciente.
5. Cantidades: cero, una, doce, trece, sesenta y más de sesenta vecinas, con y sin propia. Doce plazas iniciales, tope expandido correcto, propia primero y contracción.
6. Orden: estable durante el mismo día, sin ranking. No exigir que cada vecino cambie de posición todos los días.
7. Estados: sin mascota propia, vacío, carga lenta, fallo y recuperación. El club sigue utilizable.
8. Actualización: nuevas consultas respetan cambios de privacidad, bloqueos y membresía; acciones propias refrescan. No exigir propagación en tiempo real a otras pantallas.
9. Interfaz: ubicación exclusiva en feed, móvil, escritorio, teclado, foco utilizable y movimiento reducido. Sin regresiones en S1/S2.

Ejecutar el recorrido contra build de producción en el entorno de pruebas, con fixtures controladas y limpieza antes y después. Completar checks obligatorios pertinentes. Añadir pruebas pequeñas solo si el recorrido completo no distingue de forma fiable una regresión concreta.

Separar evidencia técnica, aceptación visual de José Ángel en desarrollo y, cuando se autorice, publicación/verificación en producción. Esta spec no afirma que esas pruebas se hayan ejecutado para S3.

## Out of Scope

- Combate cooperativo, recompensas, economía, regalos, reacciones y ranking.
- Fondos, decoración, personalización y sprites nuevos.
- Humor ajeno, actividad reciente y preferencias de visibilidad por club.
- Pestaña o ruta nueva, aparición fuera del feed y paginación más allá de sesenta vecinas.
- Tiempo real y retirada retroactiva de datos cargados.
- Cambios de privacidad de perfiles o del significado de ocultar la compañera flotante.

## Further Notes

S3 pertenece a la vía social y no depende del combate. José Ángel aceptó las tres rondas y confirmó el contrato al invocar `to-spec` para formalizarlo y publicarlo como issue. No quedan preguntas de producto abiertas.

La confirmación cierra el diseño; no declara la entrega implementada ni autoriza cambios de bases de datos remotas o publicación de la aplicación. Las capacidades de ejecución conservan las reglas del proyecto.

Glosario y decisiones viven en los documentos canónicos, sin equivalentes paralelos. Triage: área clubes, tipo feature y P3; no es un fallo actual de producción.
