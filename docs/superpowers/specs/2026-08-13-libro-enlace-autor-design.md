---
title: Acceso a la ficha de persona desde la ficha de libro
date: 2026-08-13
status: design
area: catalogo / ui / people
---

# Ficha de libro: el autor enlaza a su ficha de persona

## Problema

La ficha de persona (`/persona/[id]`) existe y, tras el rediseño a tres columnas, es la
vista donde se lee la obra completa de un autor. Pero **desde un libro no se puede llegar
a ella**: no hay ni un enlace a `/persona/*` en toda la ficha de libro.

Hoy el autor de un libro aparece dos veces, y las dos como texto muerto:

- **Byline del hero** — `book.author · año`, cadena plana construida en
  `src/app/libro/[id]/page.tsx:188`.
- **Fila «Autor» de la ficha** — `authorNames.join(", ")` dentro de `metaRows`
  (`src/app/libro/[id]/page.tsx:431`), que pinta `MetadataSidebar` como `<span>`.

El dato para enlazar ya está resuelto en la página: `getItemCredits("book", book.id)`
devuelve los créditos y la línea 347 ya filtra `credits.crew.filter(c => c.role ===
"author")`, con `people.id` incluido. El comentario justo encima —«Autores como enlaces a
su ficha; si no se pudo enriquecer, texto plano»— describe una intención que nunca se
cableó: el `id` se calcula y se tira, y solo se usa el nombre.

Película y serie no tienen este problema: ambas pintan `CreditsSection`
(`src/components/credits-section.tsx`), que ya enlaza con `personHref(person.id)` tanto en
el equipo como en los avatares del reparto. El libro es el único medio que se quedó fuera.

## Solución

Convertir la fila «Autor» de la ficha del libro en uno o varios enlaces a
`/persona/[id]`, reutilizando los créditos que la página ya tiene cargados.

### 1. `MetaRow` admite enlaces (`src/components/detail/metadata-sidebar.tsx`)

```ts
export type MetaRow = {
  label: string;
  value: string;                              // texto plano / fallback
  links?: { href: string; label: string }[];  // si viene, manda sobre `value`
};
```

`MetadataSidebar` pinta, en el hueco del valor:

- si `links` está presente y no vacío → un `<Link>` de `next/link` por entrada, separados
  por `, `, con el tratamiento que ya usa el equipo en `CreditsSection`:
  `font-medium text-foreground underline-offset-2 hover:underline`;
- si no → `value` tal cual, como hoy.

El campo es **opcional y aditivo**: película (`director`, `año`, `duración`) y serie
(`creator`, `año`, `temporadas`, `episodios`) siguen pasando solo `value` y no cambian ni
un píxel. La `MetadataSidebar` se pinta dos veces en la ficha de libro (móvil dentro del
flujo, PC en la columna de 340) desde el mismo array `metaRows`, así que el enlace aparece
en ambas sin trabajo extra.

### 2. La página del libro construye los enlaces (`src/app/libro/[id]/page.tsx`)

```ts
metaRows.push({
  label: tMeta("author"),
  value: authorNames.join(", "),
  links:
    authorCredits.length > 0
      ? authorCredits.map((a) => ({ href: personHref(a.id), label: a.name }))
      : undefined,
});
```

`authorCredits` y `authorNames` ya existen (líneas 347 y 419). Se añade el import de
`personHref` desde `@/lib/catalog/item-href`. Un autor → un enlace; varios autores → un
enlace por autor, cada uno a su ficha.

### 3. Degradación

`authorNames` ya tiene dos orígenes: los créditos enriquecidos si los hay, y si no el
campo `book.author` de la fila. El segundo caso —libro que `ensureItemEnriched` aún no ha
podido enriquecer, o autor que no existe como fila en `people`— deja `authorCredits`
vacío, `links` a `undefined` y la fila en texto plano, exactamente como hoy. No se pinta
nunca un enlace sin `people.id` detrás.

Los dos casos son excluyentes por construcción (o hay créditos, o se usa el texto de la
fila), así que no existe el caso mixto «unos autores enlazados y otros no» dentro de la
misma fila.

## Fuera de alcance

- **El byline del hero sigue plano.** Enlazar ahí obliga a tocar `ItemShell`, compartido
  por los tres medios, y a subir los créditos por encima del `<Suspense>` del hero — que
  es justo lo que el comentario de la línea 185 evita a propósito para no bloquearlo.
- **No se añade `CreditsSection` a la ficha de libro.** Para un libro el `crew` es el
  autor y nada más (`CreditRole` solo contempla `author` para libros), así que la sección
  duplicaría la fila «Autor» sin aportar dato nuevo.
- **Película y serie no se tocan:** ya llegan a la ficha de persona por `CreditsSection`.
  Sus filas `director`/`creator` salen de columnas desnormalizadas (`movie.director`,
  `series.creator`), sin `people.id`, y enlazarlas sería otro trabajo distinto.

## Verificación

El repo no tiene tests de render de componentes (Vitest cubre `src/lib/`, Playwright cubre
la UI), así que la comprobación va por e2e: spec nuevo en `e2e/` que abre la ficha de un
libro con autor enriquecido, pulsa el nombre del autor en la ficha y comprueba que la URL
resultante es `/persona/<id>` y que la ficha de persona carga con ese nombre.
