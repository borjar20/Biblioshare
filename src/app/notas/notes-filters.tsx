import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import {
  hasActiveFilters,
  notesHref,
  type NotesKindFilter,
  type NotesQuery,
  type NotesSort,
} from "@/lib/notes/query";

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

// La barra de filtros del cuaderno. Todo son ENLACES y un form GET: el estado
// vive en la URL (ver src/lib/notes/query.ts), así que esta pantalla no necesita
// una línea de JavaScript de cliente ni un `useState` que se desincronice.
export async function NotesFilters({ query }: { query: NotesQuery }) {
  const t = await getTranslations("notes");

  const kinds: { value: NotesKindFilter; label: string }[] = [
    { value: "all", label: t("notebookFilterAll") },
    { value: "quote", label: t("notebookFilterQuotes") },
    { value: "note", label: t("notebookFilterNotes") },
  ];
  const sorts: { value: NotesSort; label: string }[] = [
    { value: "recientes", label: t("notebookSortRecent") },
    { value: "obra", label: t("notebookSortWork") },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* El buscador manda a la propia ruta con GET. Los demás filtros viajan
          en hidden para que buscar no los pierda por el camino. */}
      <form action="/notas" className="flex gap-2">
        {query.kind !== "all" && (
          <input type="hidden" name="tipo" value={query.kind === "quote" ? "cita" : "nota"} />
        )}
        {query.tag && <input type="hidden" name="etiqueta" value={query.tag} />}
        {query.item && (
          <input type="hidden" name="obra" value={`${query.item.itemType}:${query.item.itemId}`} />
        )}
        {query.favorites && <input type="hidden" name="favoritas" value="1" />}
        {query.sort !== "recientes" && <input type="hidden" name="orden" value={query.sort} />}
        {/* `w-full` en el input y `min-w-0` en la celda NO son decoración: sin
            ellos el input conserva su ancho intrínseco (`size=20`, 273px) y la
            celda `flex-1` vale `min-width:auto`, que no encoge por debajo de
            ese contenido — la fila medía 391px en un viewport de 360 y el
            cuaderno entero salía con scroll lateral (#833, gemelo de #721 en
            /buscar). */}
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={t("notebookSearchPlaceholder")}
            className="w-full pl-10"
          />
        </div>
        <button type="submit" className={buttonVariants("primary", "inline-flex items-center")}>
          <SearchIcon className="h-4 w-4" />
          {t("notebookSearchSubmit")}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <Pill key={k.value} href={notesHref(query, { kind: k.value })} active={query.kind === k.value}>
            {k.label}
          </Pill>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Pill href={notesHref(query, { favorites: !query.favorites })} active={query.favorites}>
          {t("notebookFavorites")}
        </Pill>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {sorts.map((s) => (
          <Pill key={s.value} href={notesHref(query, { sort: s.value })} active={query.sort === s.value}>
            {s.label}
          </Pill>
        ))}
      </div>

      {/* Los filtros que no tienen pill propia (etiqueta, obra, búsqueda) se ven
          como chips con su X: si no, filtras por una etiqueta desde una tarjeta
          y no hay forma de saber por qué faltan notas. */}
      {hasActiveFilters(query) && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
          {query.tag && (
            <Link
              href={notesHref(query, { tag: null })}
              className="rounded-full border border-border px-3 py-1 hover:text-foreground"
            >
              {t("notebookTagChip", { tag: query.tag })} ✕
            </Link>
          )}
          {query.item && (
            <Link
              href={notesHref(query, { item: null })}
              className="rounded-full border border-border px-3 py-1 hover:text-foreground"
            >
              {t("notebookWorkChip")} ✕
            </Link>
          )}
          {query.q && (
            <Link
              href={notesHref(query, { q: "" })}
              className="rounded-full border border-border px-3 py-1 hover:text-foreground"
            >
              {t("notebookSearchChip", { q: query.q })} ✕
            </Link>
          )}
          <Link href="/notas" className="underline hover:text-foreground">
            {t("notebookClearFilters")}
          </Link>
        </div>
      )}
    </div>
  );
}
