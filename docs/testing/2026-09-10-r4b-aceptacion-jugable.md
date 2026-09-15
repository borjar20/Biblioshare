# R4b — guion de aceptación jugable (#1123)

> **[Canónico · escrito el 2026-09-10 · pendiente de ejecutar. No es evidencia: es lo que
> hay que jugar para poder decir «R4b está aceptado». El veredicto lo escribe José Ángel al
> final de este mismo fichero y en #1123.]**

R4b se publicó en producción el 2026-09-09 (PR #1146) **sin aceptación jugable**, a decisión
del dueño. Su verificación técnica está completa y no hace falta repetirla: implementación en
[2026-09-08-r4b-verificacion.md](2026-09-08-r4b-verificacion.md) y 1.254.400 simulaciones de
balance en [2026-09-08-r4b-balance.md](2026-09-08-r4b-balance.md).

Lo que ni la una ni las otras pueden contestar es lo que pide el contrato de la hoja de ruta
(Parte II, R4b):

1. **Un objeto nuevo da ganas de probarlo, y ninguna build domina entre los seis.**
2. **Lo ganado en R4a se activa sin perder nada.**

La simulación acredita que los seis objetos son útiles y que ninguna de las 16 builds neutrales
gana a todas las demás a la vez, que es la mitad medible del criterio 1. La otra mitad —«da
ganas de probarlo»— y el criterio 2 con datos reales solo salen jugando.

## Antes de empezar

- **Cuenta real en producción, la tuya.** Esto gasta aventuras de verdad: cada día vivido que
  juegues sale de la ventana de siete días y no vuelve. No es un entorno de pruebas.
- Si no hay aventuras pendientes, no fuerces actividad para conseguirlas: espera a un día en
  que hayas usado Biblioshare con normalidad. Que haga falta forzar sería, en sí, un hallazgo
  del criterio antifarm de R4a.
- El **entrenamiento** (`/mascota?view=training`) es gratis, repetible y no concede botín: sirve
  para probar el equipo ya equipado tantas veces como quieras sin gastar nada. Úsalo para todo
  lo que no exija ganar un objeto nuevo.
- Ten a mano cuántas aventuras pendientes dice el campamento **antes** de empezar.

## El recorrido

Cada paso dice qué mirar y qué contaría como fallo. Un fallo no invalida el resto: anótalo y
sigue.

### 1. El campamento dice la verdad

Entra en `/mascota`. El botón de aventura dice cuántas tienes pendientes.

- **Falla si** el número no coincide con los días que has usado Biblioshare en la última semana,
  o si dice que hay aventura en curso cuando no la hay.

### 2. Una aventura sin equipo (línea base)

Con las dos ranuras vacías, juega una cadena entera.

- **Mira:** ¿entiendes por qué ganas o pierdes cada tramo? ¿La vida arrastrada entre tramos se
  ve venir?
- **Falla si** pierdes sin poder decir qué habrías hecho distinto.

### 3. El botín aparece y se entiende

Al ganar, la mascota concede una copia y aparece el acceso a «Ver equipo».

- **Mira:** ¿queda claro **qué** has ganado, de qué ranura es y qué hace? ¿La potencia (×0,8 a
  ×1,2) se lee como «esta copia concreta» y no como «este objeto vale eso siempre»?
- **Falla si** hay que abrir la comparación para enterarte de qué te ha tocado.

### 4. Equipar y comparar

Ve a Personaje. Selecciona la copia, mira la comparación contra lo equipado, equipa.

- **Mira:** ¿la comparación se lee de un vistazo o hay que hacer cuentas? Al tener dos copias
  del mismo objeto con potencias distintas, ¿está claro cuál conviene?
- **Falla si** equipar no confirma nada visible, o si tras recargar la página el equipo no es el
  que dejaste puesto.

### 5. El efecto se nota en combate

Con el objeto equipado, entra en entrenamiento y juega hasta que el efecto se dispare (interrumpir
una carga, usar la ulti, pasar de tramo…).

- **Mira:** el aviso del objeto aparece **cuando** hace algo, y dice qué ha hecho. ¿Se nota que
  llevas ese objeto, o daría igual?
- **Falla si** el objeto no se manifiesta nunca en pantalla, o si el aviso sale cuando el efecto
  no se ha aplicado (por tope, por vida llena, por no haber vulnerabilidad).
- **Este es el paso del criterio 1:** al ver lo que hace, ¿te apetece cambiar de objeto y probar
  otro? Si la respuesta es «me da igual cuál lleve», eso es un no al hito, no un defecto suelto.

### 6. Lo ganado en R4a sigue ahí (criterio 2)

Si conservas copias de antes del 2026-09-08 —las que R4a guardó «pendientes de activar», sin
efecto—, compruébalas.

- **Mira:** ¿siguen en la mochila? ¿Se pueden equipar? ¿Su potencia es coherente con las nuevas?
- **Falla si** falta alguna, o si una copia vieja no se puede equipar.
- Las copias anteriores a R4b no llevan potencia sellada: si aparecen tratadas como ×1,0 es lo
  esperado, no un fallo. Lo que sería fallo es que desaparecieran.

### 7. Repetir lo suficiente para opinar

Las dos preguntas de arriba («da ganas de probarlo», «ninguna domina») no se contestan con una
partida. Juega varias aventuras a lo largo de varios días, cambiando de equipo, y contesta al
final. No hace falta un número: hace falta que la respuesta no sea una impresión de la primera
vez.

## Lo que NO es de este hito

Anótalo aparte y ábrelo como issue; no bloquea la aceptación de R4b:

- **Tinta y desencantado** de duplicados: aplazados a propósito en #1134.
- **Tercera ranura**, afijos, Aspectos y rarezas: R8, R9 y siguientes.
- **Bellotas y tienda:** R5, todavía sin diseñar.
- **El catálogo del botín con la mochila llena** (#1170): arreglado el 2026-09-10 pero **aún no
  publicado**. En producción sigue desapareciendo con la primera copia. Si lo ves, es eso.

## Veredicto

<!-- Rellenar al terminar. Si es «no», decir qué criterio falla y por qué; un «no» razonado vale
     más que un «sí» de compromiso, y es lo que decide si R5 arranca o R4b se corrige. -->

- **Fecha:**
- **Aventuras jugadas:**
- **Criterio 1 (un objeto da ganas de probarlo; ninguna build domina):**
- **Criterio 2 (lo ganado en R4a se activa sin perder nada):**
- **Veredicto:**
- **Issues abiertas a raíz de esto:**
