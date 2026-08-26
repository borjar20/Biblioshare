import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import {
  getLibraryItems,
  getLibraryView,
  getUserGenres,
} from "@/lib/library/get-library-items";
import { SHOW_DROPPED_PARAM } from "@/lib/library/hide-dropped";
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
import { genreDefForSlug } from "@/lib/catalog/genre-vocab";
import {
  resolveEffectiveType,
  ALL_TYPES_PARAM,
} from "@/lib/library/effective-type";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { InboxIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { CollectionTabs, KNOWN_TABS, type KnownTab } from "./collection-tabs";
import { CollectionSummary } from "@/components/library/collection-summary";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { CollectionsGrid } from "@/components/library/collections-grid";
import { getLibrarySummary } from "@/lib/library/get-library-summary";
import { getFollowedSagas } from "@/lib/sagas/get-followed-sagas";
import { SagaLibraryCard } from "@/components/library/saga-library-card";
import { SkeletonCoverGrid, SkeletonLine } from "@/components/ui/skeleton";
import {
  CARD_GRID_COLS,
  COVER_GRID_COLS,
  SHELL_GRID,
} from "@/lib/ui/layout";
import {
  CollectionOverviewSkeleton,
  CollectionsGridSkeleton,
  SagasPanelSkeleton,
} from "@/components/library/collection-skeletons";
import { NewCollectionButton } from "@/components/library/new-collection-button";
import { UncollectedShelf } from "@/components/library/uncollected-shelf";

export const metadata: Metadata = {
  title: "Mi Biblioteca — Biblioshare",
};

const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const VALID_SORTS: LibrarySort[] = ["recent", "rating", "title"];
const VALID_TYPES: ItemType[] = ["book", "movie", "series"];

// Mi Biblioteca (Colección v2, Sesión 1 + F5 Task 4): gira en torno a
// colecciones que crea el usuario, no a estados. Tres subpestañas visibles —
// `Todo` (la pestaña por DEFECTO, frame C: la biblioteca completa sin el bloque
// «en curso», que ahora vive en Inicio/Perfil), `Colecciones` (frame A) y
// `Sagas` (frame COL, sagas seguidas con progreso).
//
// Las **colas** (§7.22) se retiran aquí (2026-07-20): al integrar Colección v2
// dejaron de pintarse en las subpestañas y quedaron inalcanzables — ningún
// enlace llevaba a `?tab=colas`. Acotar el pool del sorteo a un subconjunto
// propio, que era su único uso vivo, lo hacen ahora las colecciones marcadas
// `is_sorteable`. La tabla `queues` y sus columnas se borraron en la fase B
// (`20260720_drop_queues.sql`).
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    q?: string;
    sort?: string;
    type?: string;
    genero?: string;
    abandonados?: string;
  }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/coleccion"));

  const params = await searchParams;
  const tab: KnownTab = KNOWN_TABS.includes(params.tab as KnownTab)
    ? (params.tab as KnownTab)
    : "todo";
  const status = VALID_STATUSES.includes(params.status as MediaStatus)
    ? (params.status as MediaStatus)
    : undefined;
  const search = params.q?.trim() || undefined;
  const sort: LibrarySort = VALID_SORTS.includes(params.sort as LibrarySort)
    ? (params.sort as LibrarySort)
    : "recent";
  // Slug inválido -> se trata como si no hubiera filtro (no se propaga a
  // getLibraryItems, que devolvería la biblioteca vacía para un slug basura).
  const genre =
    params.genero && genreDefForSlug(params.genero) ? params.genero : undefined;
  // Con ?type= explícito manda la URL. Sin él, y SOLO si el usuario declaró
  // exactamente UN interés en el onboarding, el filtro de «Todo» arranca ahí:
  // con dos o tres no hay un tipo "obvio" y forzar uno escondería media
  // biblioteca sin que nadie lo haya pedido. El centinela `type=todos` es la vía
  // para pedir "todos los tipos" de forma distinguible del arranque por defecto
  // —sin él, el pill «Todos los tipos» no podía escapar del preferido (issue #313).
  //
  // Ojo: aquí NO se toca la pestaña de entrada. Colección v2 dejó las
  // subpestañas en colecciones|todo|sagas|colas — no hay pestaña por tipo.
  const isExplicitType =
    VALID_TYPES.includes(params.type as ItemType) ||
    params.type === ALL_TYPES_PARAM;
  // La lectura del perfil deja de ser condicional: `hide_dropped` hace falta en
  // las tres pestañas (rejilla, tira «Sin colección», destacados), no solo en
  // la rama sin tipo explícito. Es una fila por PK en una página que ya hace
  // varias consultas; `interests` se sigue ignorando cuando la URL manda.
  const { data: prefs } = await supabase
    .from("profiles")
    .select("interests, hide_dropped")
    .eq("user_id", user.id)
    .maybeSingle();
  const interests: ItemType[] = isExplicitType
    ? []
    : ((prefs?.interests ?? []) as ItemType[]);
  const hideDroppedPref = prefs?.hide_dropped ?? false;
  // `?abandonados=1` anula la preferencia solo en esta vista (spec D7).
  const showDropped = params.abandonados === "1";
  const hideDropped = hideDroppedPref && !showDropped;
  const itemType: ItemType | undefined = resolveEffectiveType(
    params.type,
    interests,
  );

  // Géneros del selector: solo se consultan en la pestaña `todo`, donde vive
  // `LibraryFilters` — evita la query extra en `colecciones`/`sagas`. Se acota
  // al MISMO `itemType` efectivo (lock de onboarding o `?type=`), al MISMO
  // `status` y a la MISMA preferencia `hideDropped` que recibe la rejilla más
  // abajo: si no, un chip de un tipo bloqueado, de un estado no filtrado o de
  // un género solo-abandonados-ocultos filtraría la rejilla a 0 (issue #306).
  const genres =
    tab === "todo" ? await getUserGenres(supabase, user.id, itemType, status, hideDropped) : [];

  const t = await getTranslations("collection");
  const tLibrary = await getTranslations("library");

  // Shell inmediato (título + pestañas); cada sección con datos llega por
  // streaming detrás de su <Suspense> con skeleton (Fase B del plan de
  // navegación). El `key` de los boundaries es la consulta: al cambiar un
  // filtro, la sección vuelve a mostrar su skeleton en vez de congelarse.
  //
  // Ancho ÚNICO (`SHELL_GRID`) para las tres pestañas: el ancho del CONTENEDOR
  // y el tamaño de las TARJETAS son dos decisiones distintas. `Colecciones` y
  // `Sagas` vivían antes en `SHELL_READ` (896px), luego en un `SHELL_TILES`
  // propio (1280px) — cada cambio de ancho por pestaña provocaba un salto de
  // layout al alternar `Todo`/`Colecciones`/`Sagas`. `Colecciones` usa su
  // propia rejilla (`TILE_GRID_COLS`), pero mismo TECHO grande que `Sagas`
  // (`CARD_GRID_COLS`): las dos llegan a 4 columnas en `xl`, solo difieren en
  // móvil (2 en Colecciones, tarjeta vertical estrecha; 1 en Sagas, tarjeta
  // horizontal).
  const shell = SHELL_GRID;

  // Enlace «Mostrar» de la nota: la MISMA vista más `?abandonados=1`. Se
  // construye aquí y no en el componente porque el componente es genérico y no
  // conoce los filtros de esta página.
  function showDroppedHref(): string {
    const qs = new URLSearchParams({ tab: "todo" });
    if (params.type) qs.set("type", params.type);
    if (status) qs.set("status", status);
    if (sort !== "recent") qs.set("sort", sort);
    if (genre) qs.set("genero", genre);
    if (search) qs.set("q", search);
    qs.set(SHOW_DROPPED_PARAM, "1");
    return `/coleccion?${qs.toString()}`;
  }

  return (
    <div
      className={`mx-auto flex w-full ${shell} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}
    >
      {/* Cabecera del frame A/C: barrita de acento + título serif. El recuento
          NO va aquí (la maqueta deja el wordmark limpio): en `Colecciones` lo
          da su header «N colecciones · M títulos» y en `Todo` el Resumen. */}
      <PageHeader title={t("title")} />

      <CollectionTabs active={tab} />

      {tab === "colecciones" && (
        <>
          {/* El botón va FUERA del <Suspense> del recuento: comparten fila,
              pero el fallback del recuento no puede llevárselo por delante —
              crear la primera colección no depende de saber cuántas hay. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={<SkeletonLine className="w-44" />}>
              <CollectionsHeader userId={user.id} />
            </Suspense>
            <NewCollectionButton />
          </div>
          <Suspense fallback={<CollectionsGridSkeleton />}>
            <CollectionsGrid userId={user.id} />
          </Suspense>
          {/* Lo que no está en ninguna colección, al pie: se pinta sola solo si
              hay algo suelto Y el usuario ya tiene alguna colección. */}
          <Suspense fallback={null}>
            <UncollectedShelf userId={user.id} hideDropped={hideDropped} />
          </Suspense>
        </>
      )}

      {tab === "todo" && (
        <>
          {/* Resumen + destacados: solo sin filtros — con uno activo
              contradirían lo que la rejilla filtrada está mostrando. Los
              destacados del dueño viven aquí, no en su perfil: el perfil
              propio pierde la pestaña Colección (plan 05, P2) y sin esta
              casa se quedarían sin sitio (D2). */}
          {!status && !search && !itemType && !genre && (
            <Suspense fallback={<CollectionOverviewSkeleton />}>
              <TodoOverview userId={user.id} hideDropped={hideDropped} />
            </Suspense>
          )}
          <LibraryFilters
            itemType={itemType}
            status={status}
            search={search}
            sort={sort}
            genre={genre}
            genres={genres}
            basePath="/coleccion"
            showTypeFilter
            hideDroppedPref={hideDroppedPref}
            showDropped={showDropped}
            extraParams={{ tab: "todo" }}
          />
          <Suspense
            key={`todo:${itemType ?? ""}:${status ?? ""}:${search ?? ""}:${sort}:${genre ?? ""}:${hideDropped}`}
            fallback={<SkeletonCoverGrid count={16} cols={COVER_GRID_COLS} />}
          >
            <LibraryGrid
              userId={user.id}
              itemType={itemType}
              status={status}
              search={search}
              sort={sort}
              genre={genre}
              hideDropped={hideDropped}
              showDroppedHref={showDroppedHref()}
              emptyTitle={tLibrary("emptyTitle")}
              emptyLabel={tLibrary("empty")}
              emptyCta={tLibrary("emptyCta")}
            />
          </Suspense>
        </>
      )}

      {tab === "sagas" && (
        <Suspense fallback={<SagasPanelSkeleton />}>
          <FollowedSagasPanel userId={user.id} />
        </Suspense>
      )}
    </div>
  );
}

// Cabecera de la rejilla de Colecciones (frame A): «N colecciones · M
// títulos». Consulta propia, en Suspense aparte, para no bloquear el grid.
async function CollectionsHeader({ userId }: { userId: string }) {
  const supabase = await createClient();
  // Recuento ligero: `head:true` + `count:exact` no trae filas ni portadas —
  // el grid (CollectionsGrid) es quien hidrata los abanicos, no este header.
  const [{ count }, summary, t] = await Promise.all([
    supabase
      .from("collections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    getLibrarySummary(supabase, userId),
    getTranslations("collection"),
  ]);
  return (
    <p className="font-mono text-xs tracking-wide text-muted-foreground">
      {t("collectionsCount", { count: count ?? 0 })}
      {" · "}
      {t("titleCount", { count: summary.total })}
    </p>
  );
}

async function TodoOverview({
  userId,
  hideDropped,
}: {
  userId: string;
  hideDropped: boolean;
}) {
  const supabase = await createClient();
  const [summary, favorites] = await Promise.all([
    // El Resumen NO se toca: su barra apilada por estado es el único sitio
    // donde se ve que existen abandonados (spec D6).
    getLibrarySummary(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true, hideDropped }),
  ]);

  if (summary.total === 0) return null;

  // En escritorio ancho el Resumen y los Destacados van EN PARALELO: apilados
  // a 1600px, la tarjeta del Resumen quedaba con la leyenda «En curso ····· 4»
  // separada medio metro y el estante de portadas se inflaba a 6 portadas
  // gigantes. Sin destacados que poner al lado, el Resumen se topa en vez de
  // estirarse — una tarjeta de 1600px de ancho y cuatro líneas de alto no la
  // quiere nadie.
  const hasFavorites = favorites.length > 0;

  return (
    <div
      className={`flex flex-col gap-6 ${hasFavorites ? "xl:flex-row xl:items-start" : ""}`}
    >
      <div
        className={hasFavorites ? "xl:w-[360px] xl:shrink-0" : "xl:max-w-3xl"}
      >
        <CollectionSummary summary={summary} />
      </div>
      {hasFavorites && (
        <div className="min-w-0 flex-1">
          <FavoritesShelf items={favorites} />
        </div>
      )}
    </div>
  );
}

async function LibraryGrid({
  userId,
  itemType,
  status,
  search,
  sort,
  genre,
  limit,
  hideDropped,
  showDroppedHref,
  emptyTitle,
  emptyLabel,
  emptyCta,
}: {
  userId: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
  genre?: string;
  limit?: number;
  hideDropped: boolean;
  showDroppedHref: string;
  emptyTitle: string;
  emptyLabel: string;
  emptyCta: string;
}) {
  const supabase = await createClient();
  const { items, hiddenDropped } = await getLibraryView(supabase, userId, {
    itemType,
    status,
    search,
    sort,
    genre,
    limit,
    hideDropped,
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={emptyTitle}
          message={emptyLabel}
          action={
            <Link href="/buscar" className={buttonVariants("primary")}>
              {emptyCta}
            </Link>
          }
        />
        {/* La nota TAMBIÉN en el vacío: una biblioteca entera de abandonados
            que parece vacía sin explicación es el peor resultado posible de
            esta feature. */}
        <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-4 ${COVER_GRID_COLS}`}>
        {items.map((item) => (
          <LibraryItemCard key={item.entryId} item={item} isOwner inCollection />
        ))}
      </div>
      <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
    </div>
  );
}

// Sagas seguidas (frame COL): cards con progreso segmentado y bloque
// «siguiente». Los datos llegan en un solo batch (getFollowedSagas).
async function FollowedSagasPanel({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [cards, t] = await Promise.all([
    getFollowedSagas(supabase, userId),
    getTranslations("sagaLibrary"),
  ]);

  if (cards.length === 0) {
    return (
      <EmptyState
        glyph={<InboxIcon className="h-7 w-7" />}
        title={t("emptyTitle")}
        message={t("emptyBody")}
        action={
          <Link href="/sagas" className={buttonVariants("primary")}>
            {t("emptyCta")}
          </Link>
        }
      />
    );
  }

  // Misma escalera que el índice de sagas (`/sagas`), que pinta tarjetas del
  // mismo tipo: una columna en móvil (la card es horizontal y a dos se
  // rompe) y hasta cuatro en pantalla ancha.
  return (
    <div className={`grid gap-4 ${CARD_GRID_COLS}`}>
      {cards.map((card) => (
        <SagaLibraryCard key={card.sagaId} card={card} />
      ))}
    </div>
  );
}
