import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import {
  CollectionTabs,
  KNOWN_TABS,
  type KnownTab,
} from "./collection-tabs";
import { QueuesPanel } from "./queues-panel";
import { CollectionSummary } from "@/components/library/collection-summary";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { CollectionsGrid } from "@/components/library/collections-grid";
import { getLibrarySummary } from "@/lib/library/get-library-summary";
import { getFollowedSagas } from "@/lib/sagas/get-followed-sagas";
import { SagaLibraryCard } from "@/components/library/saga-library-card";
import { SkeletonCoverGrid } from "@/components/ui/skeleton";
import {
  CollectionOverviewSkeleton,
  CollectionsGridSkeleton,
  QueuesSkeleton,
} from "@/components/library/collection-skeletons";

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
// `Colecciones` (default, frame A), `Todo` (frame C, la biblioteca completa
// sin el bloque «en curso», que ahora vive en Inicio/Perfil) y `Sagas` (frame
// COL, sagas seguidas con progreso). `colas` sigue siendo una ruta viva
// (`?tab=colas`, `happy-path.spec.ts`) pero ya no se pinta en las
// subpestañas.
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    q?: string;
    sort?: string;
    cola?: string;
    type?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tab: KnownTab = KNOWN_TABS.includes(params.tab as KnownTab)
    ? (params.tab as KnownTab)
    : "colecciones";
  const status = VALID_STATUSES.includes(params.status as MediaStatus)
    ? (params.status as MediaStatus)
    : undefined;
  const search = params.q?.trim() || undefined;
  const sort: LibrarySort = VALID_SORTS.includes(params.sort as LibrarySort)
    ? (params.sort as LibrarySort)
    : "recent";
  // Con ?type= explícito manda la URL. Sin él, y SOLO si el usuario declaró
  // exactamente UN interés en el onboarding, el filtro de «Todo» arranca ahí:
  // con dos o tres no hay un tipo "obvio" y forzar uno escondería media
  // biblioteca sin que nadie lo haya pedido.
  //
  // Ojo: aquí NO se toca la pestaña de entrada. Colección v2 dejó las
  // subpestañas en colecciones|todo|sagas|colas — no hay pestaña por tipo.
  const explicitType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : null;
  let preferredType: ItemType | undefined;
  if (explicitType === null) {
    const { data: prefs } = await supabase
      .from("profiles")
      .select("interests")
      .eq("user_id", user.id)
      .maybeSingle();
    const interests = prefs?.interests ?? [];
    preferredType = interests.length === 1 ? interests[0] : undefined;
  }
  const itemType: ItemType | undefined = explicitType ?? preferredType;

  const t = await getTranslations("collection");
  const tLibrary = await getTranslations("library");

  // Shell inmediato (título + pestañas); cada sección con datos llega por
  // streaming detrás de su <Suspense> con skeleton (Fase B del plan de
  // navegación). El `key` de los boundaries es la consulta: al cambiar un
  // filtro, la sección vuelve a mostrar su skeleton en vez de congelarse.
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Cabecera del frame A/C: barrita de acento + título serif. El recuento
          NO va aquí (la maqueta deja el wordmark limpio): en `Colecciones` lo
          da su header «N colecciones · M títulos» y en `Todo` el Resumen. */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-[22px] w-2 shrink-0 rounded-full bg-accent"
        />
        <h1 className="font-serif text-2xl font-semibold text-foreground lg:text-[28px]">
          {t("title")}
        </h1>
      </div>

      <CollectionTabs active={tab} />

      {tab === "colecciones" && (
        <>
          <Suspense fallback={null}>
            <CollectionsHeader userId={user.id} />
          </Suspense>
          <Suspense fallback={<CollectionsGridSkeleton />}>
            <CollectionsGrid userId={user.id} />
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
          {!status && !search && !itemType && (
            <Suspense fallback={<CollectionOverviewSkeleton />}>
              <TodoOverview userId={user.id} />
            </Suspense>
          )}
          <LibraryFilters
            itemType={itemType}
            status={status}
            search={search}
            sort={sort}
            basePath="/coleccion"
            showTypeFilter
            extraParams={{ tab: "todo" }}
          />
          <Suspense
            key={`todo:${itemType ?? ""}:${status ?? ""}:${search ?? ""}:${sort}`}
            fallback={<SkeletonCoverGrid count={10} />}
          >
            <LibraryGrid
              userId={user.id}
              itemType={itemType}
              status={status}
              search={search}
              sort={sort}
              emptyTitle={tLibrary("emptyTitle")}
              emptyLabel={tLibrary("empty")}
              emptyCta={tLibrary("emptyCta")}
            />
          </Suspense>
        </>
      )}

      {tab === "sagas" && (
        <Suspense fallback={<SkeletonCoverGrid count={4} />}>
          <FollowedSagasPanel userId={user.id} />
        </Suspense>
      )}

      {tab === "colas" && (
        <Suspense key={params.cola ?? "all"} fallback={<QueuesSkeleton />}>
          <QueuesPanel userId={user.id} activeParam={params.cola} />
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

async function TodoOverview({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [summary, favorites] = await Promise.all([
    getLibrarySummary(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);

  return (
    <>
      <CollectionSummary summary={summary} />
      <FavoritesShelf items={favorites} />
    </>
  );
}

async function LibraryGrid({
  userId,
  itemType,
  status,
  search,
  sort,
  limit,
  emptyTitle,
  emptyLabel,
  emptyCta,
}: {
  userId: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
  limit?: number;
  emptyTitle: string;
  emptyLabel: string;
  emptyCta: string;
}) {
  const supabase = await createClient();
  const items = await getLibraryItems(supabase, userId, {
    itemType,
    status,
    search,
    sort,
    limit,
  });

  if (items.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <LibraryItemCard key={item.entryId} item={item} isOwner inCollection />
      ))}
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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <SagaLibraryCard key={card.sagaId} card={card} />
      ))}
    </div>
  );
}
