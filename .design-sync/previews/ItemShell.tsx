import "@/design-sync-shims/process-shim";
import { ItemShell } from "@/components/detail/item-shell";
import { PreviewProvider } from "@/design-sync-shims/preview-provider";
import { MetadataSidebar } from "@/components/detail/metadata-sidebar";
import { SagaStrip } from "@/components/detail/saga-strip";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingDots } from "@/components/ui/rating-dots";
import type { SagaMember } from "@/lib/sagas/types";

// El viewport de la tarjeta es 1240px (cfg.overrides.ItemShell), o sea por
// encima de `lg`: lo que se ve es el árbol de PC (rail + cabecera ancha). El
// árbol móvil vive en ItemHero, que ya tiene su propia tarjeta.

const BOOK_COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjYjQ1MzA5Ii8+PHJlY3QgeD0iMTgiIHk9IjE4IiB3aWR0aD0iMjY0IiBoZWlnaHQ9IjQxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";
const SERIES_COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjN2MzYWVkIi8+PC9zdmc+";

// Las pestañas reales (item-detail-tabs) llevan estado y no se sincronizan;
// esto es la maqueta estática de la misma barra, con las utilidades del propio
// sistema — glue de layout, no una reimplementación del componente.
function Tabs({
  active,
  items,
  children,
}: {
  active: string;
  items: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="px-8 pb-10">
      <div className="mb-5 flex gap-6 border-b border-border">
        {items.map((label) => (
          <span
            key={label}
            className={
              label === active
                ? "-mb-px border-b-2 border-accent pb-3 font-mono text-xs tracking-wide text-foreground"
                : "-mb-px pb-3 font-mono text-xs tracking-wide text-muted-foreground"
            }
          >
            {label.toUpperCase()}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

function RailPanel() {
  return (
    <>
      <StatusBadge status="in_progress" label="Leyendo" />
      <ProgressBar current={312} total={662} label="312 de 662 páginas" />
      <Button>Registrar sesión</Button>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">Tu nota</span>
        <RatingDots value={9} size="sm" />
      </div>
    </>
  );
}

const SAGA: SagaMember[] = [
  { itemType: "book", itemId: "b-1", title: "El nombre del viento", coverUrl: BOOK_COVER, href: "/libro/b-1", position: 1 },
  { itemType: "book", itemId: "b-2", title: "El temor de un hombre sabio", coverUrl: BOOK_COVER, href: "/libro/b-2", position: 2 },
];

export function FichaLibro() {
  return (
    <PreviewProvider>
      <ItemShell
        itemType="book"
        mediaLabel="Libro"
        title="El nombre del viento"
        byline="Patrick Rothfuss"
        genres={["Fantasía", "Aventura", "Clásico"]}
        coverUrl={BOOK_COVER}
        avgRating={8.4}
        ratingsLabel="1.284 valoraciones"
        backLabel="Volver"
        railActions={<RailPanel />}
        tabs={
          <Tabs active="Info" items={["Info", "Mi registro", "Comunidad"]}>
            <div className="flex gap-8">
              <div className="w-64 shrink-0">
                <MetadataSidebar
                  rows={[
                    { label: "Autor", value: "Patrick Rothfuss" },
                    { label: "Editorial", value: "Plaza & Janés" },
                    { label: "Páginas", value: "662" },
                    { label: "Publicado", value: "2007" },
                  ]}
                  genres={["Fantasía", "Aventura"]}
                  genresLabel="Géneros"
                />
              </div>
              <div className="min-w-0 flex-1">
                <SagaStrip
                  members={SAGA}
                  currentType="book"
                  currentId="b-1"
                  sagaId="saga-kingkiller"
                  sagaName="Crónica del asesino de reyes"
                  positionLabel="nº 1 de 2"
                />
              </div>
            </div>
          </Tabs>
        }
      />
    </PreviewProvider>
  );
}

export function FichaSerie() {
  return (
    <PreviewProvider>
      <ItemShell
        itemType="series"
        mediaLabel="Serie"
        title="Fundación"
        byline="Basada en la novela de Isaac Asimov"
        genres={["Ciencia ficción"]}
        coverUrl={SERIES_COVER}
        avgRating={7.1}
        ratingsLabel="342 valoraciones"
        backLabel="Volver"
        railActions={
          <>
            <StatusBadge status="in_progress" label="Viendo" />
            <ProgressBar current={7} total={10} label="7 de 10 episodios" />
            <Button>Marcar episodio</Button>
          </>
        }
        tabs={
          <Tabs active="Episodios" items={["Info", "Episodios", "Comunidad"]}>
            <div className="w-64">
              <MetadataSidebar
                rows={[
                  { label: "Creador", value: "David S. Goyer" },
                  { label: "Temporadas", value: "2" },
                  { label: "Estreno", value: "2021" },
                ]}
                genresLabel="Géneros"
              />
            </div>
          </Tabs>
        }
      />
    </PreviewProvider>
  );
}
