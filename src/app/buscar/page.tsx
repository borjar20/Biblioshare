import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { searchCatalog } from "@/lib/catalog/search";
import type { ItemType } from "@/lib/catalog/types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon, TiersIcon } from "@/components/ui/icons";
import { SearchForm } from "./search-form";
import { SearchResultCard } from "./search-result-card";
import { PeopleResults } from "./people-results";
import { ResultsEyebrow } from "./results-eyebrow";
import { COVER_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Buscar — Biblioshare",
};

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];

type SearchMode = "titles" | "people";

// Buscar tiene dos modos: títulos (catálogo) y personas (la antigua /usuarios,
// absorbida aquí en el rediseño Paper).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; modo?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const mode: SearchMode = params.modo === "personas" ? "people" : "titles";
  const t = await getTranslations("search");
  const supabase = await createClient();

  // Sin ?type= explícito se abre en el primer tipo que el usuario declaró en el
  // onboarding; con intereses null (todos los perfiles previos) sigue siendo
  // "book", que es el comportamiento de siempre.
  //
  // La consulta SOLO se hace cuando falta el parámetro: con ?type= manda la URL
  // y no hace falta preguntar nada. /buscar es pública, así que sin sesión
  // también cae en "book".
  const explicitType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : null;
  let preferredType: ItemType = "book";
  if (explicitType === null) {
    const user = await getCurrentUser();
    if (user) {
      const { data: prefs } = await supabase
        .from("profiles")
        .select("interests")
        .eq("user_id", user.id)
        .maybeSingle();
      preferredType = prefs?.interests?.[0] ?? "book";
    }
  }
  const itemType: ItemType = explicitType ?? preferredType;
  const [results, role] = await Promise.all([
    mode === "titles" && query
      ? searchCatalog(itemType, query)
      : Promise.resolve([]),
    getCurrentUserRole(supabase),
  ]);
  // Añadir manualmente es contribución curada → solo colaborador+ (§7.35).
  const canContribute = hasMinRole(role, "collaborator");

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <PageHeader title={t("title")} />

      <ModeSwitch mode={mode} query={query} itemType={itemType} />

      {mode === "people" ? (
        <>
          <PeopleSearchBar query={query} />
          <PeopleResults query={query} />
        </>
      ) : (
        <>
          <SearchForm query={query} itemType={itemType} />

          {/* Sagas no cuelga de ninguna barra de navegación, y su único enlace
              estable era ESTE, en mono de 11px, gris y en versalitas: leído
              como un rótulo de sección, no como un destino. Al ser lo único que
              separaba una feature entera del olvido (F3-010/F1-025), pasa a
              tener forma de sitio al que se va. La regla de reparto de la IA lo
              deja aquí y no en «Tú»: una saga es del catálogo, no tuya. */}
          <Link
            href="/sagas"
            className="flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted tap-44"
          >
            <TiersIcon className="h-4 w-4 text-muted-foreground" />
            {t("browseSagas")}
          </Link>

          {/* «Escribe algo para buscar» era una línea gris bajo el formulario
              (F3-015): la pantalla de entrada a la búsqueda parecía a medio
              cargar. Misma anatomía que el «sin resultados» de debajo, en talla
              de panel porque el formulario ya ocupa la mitad de arriba. */}
          {!query && (
            <EmptyState
              variant="panel"
              glyph={<SearchIcon className="h-5 w-5" />}
              title={t("empty")}
              message={t("emptyBody")}
            />
          )}

          {query && results.length === 0 && (
            <EmptyState
              glyph={<SearchIcon className="h-7 w-7" />}
              title={t("noResultsTitle")}
              message={t("noResults")}
              action={
                // Nada coincide: el camino de salida es el alta manual, si el
                // usuario tiene permiso para contribuir.
                canContribute ? (
                  <Link
                    href={`/buscar/manual?type=${itemType}`}
                    className={buttonVariants("primary")}
                  >
                    {t("manual.link")}
                  </Link>
                ) : undefined
              }
            />
          )}

          {results.length > 0 && (
            <>
              <ResultsEyebrow count={results.length} />

              <div className={`grid gap-4 ${COVER_GRID_COLS}`}>
                {results.map((result) => (
                  <SearchResultCard
                    key={`${result.itemType}-${result.externalId}`}
                    result={result}
                  />
                ))}
              </div>

              {canContribute && (
                <Link
                  href={`/buscar/manual?type=${itemType}`}
                  className="self-start text-sm text-muted-foreground underline hover:text-foreground"
                >
                  {t("manual.link")}
                </Link>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

async function ModeSwitch({
  mode,
  query,
  itemType,
}: {
  mode: SearchMode;
  query: string;
  itemType: ItemType;
}) {
  const t = await getTranslations("search.modes");
  const q = query ? `&q=${encodeURIComponent(query)}` : "";

  const modes: { key: SearchMode; href: string }[] = [
    { key: "titles", href: `/buscar?type=${itemType}${q}` },
    { key: "people", href: `/buscar?modo=personas${q}` },
  ];

  return (
    <div className="flex gap-6 border-b border-border font-mono">
      {modes.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          className={`-mb-px border-b-2 px-1 pb-3 text-xs font-medium tracking-wider uppercase transition-colors ${
            m.key === mode
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(m.key)}
        </Link>
      ))}
    </div>
  );
}

async function PeopleSearchBar({ query }: { query: string }) {
  const t = await getTranslations("users");

  return (
    <form action="/buscar" className="flex gap-2">
      <input type="hidden" name="modo" value="personas" />
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t("placeholder")}
          className="w-full pl-10"
        />
      </div>
      <button
        type="submit"
        className={buttonVariants("primary", "inline-flex items-center")}
      >
        <SearchIcon className="h-4 w-4" />
        {t("submit")}
      </button>
    </form>
  );
}
