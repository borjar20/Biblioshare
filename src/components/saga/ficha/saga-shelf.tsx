"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { Shelf, ShelfGroup, ShelfSlot, ShelfWork } from "@/lib/sagas/derive-shelf";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { OpenGroup, Pile, ShelfRatingsContext } from "./saga-shelf-parts";

type A11yItem = { work: ShelfWork; extra: string };
type T = ReturnType<typeof useTranslations>;

// Solo dice la mitad que existe: «entre — y —» no informa de nada.
function windowText(s: Extract<ShelfSlot, { kind: "window" }>, t: T): string {
  if (s.afterTitle && s.beforeTitle) return t("shelfWindowA11y", { after: s.afterTitle, before: s.beforeTitle });
  if (s.afterTitle) return t("shelfWindowAfterA11y", { title: s.afterTitle });
  if (s.beforeTitle) return t("shelfWindowBeforeA11y", { title: s.beforeTitle });
  return t("shelfWindow");
}

function slotA11y(s: ShelfSlot, t: T): A11yItem[] {
  if (s.kind === "tandem") return s.works.map((work) => ({ work, extra: `, ${t("shelfTandem")}` }));
  if (s.kind === "window")
    return [{ work: s.work, extra: `, ${windowText(s, t)}` }];
  return [{ work: s.work, extra: "" }];
}

// La balda de la ficha de saga (spec 2026-10-27 §2). Solo pinta lo que decide
// `deriveShelf`; el único estado propio es QUÉ grupo está desplegado.
export function SagaShelf({
  shelf, sagaName, routes, activeRoute, baseHref, readingHref, ratings,
}: {
  shelf: Shelf;
  sagaName: string;
  routes: Array<{ slug: string; name: string }>;
  activeRoute: string;
  baseHref: string;
  readingHref: string;
  /** Tus notas (1–10) por clave de nodo, para los puntos bajo las portadas
   *  leídas. Promesa: la balda no espera a la lectura de tus pases. */
  ratings?: Promise<Record<string, number>>;
}) {
  const t = useTranslations("saga");
  const [open, setOpen] = useState(shelf.openGroupKey);
  // Abrir una pila desmonta el botón enfocado: el foco se devuelve a la balda.
  const focusAfterOpen = useRef(false);
  // Si llega otra balda (cambio de ruta con la misma instancia), se resincroniza.
  const [prevOpenKey, setPrevOpenKey] = useState(shelf.openGroupKey);
  if (shelf.openGroupKey !== prevOpenKey) {
    setPrevOpenKey(shelf.openGroupKey);
    setOpen(shelf.openGroupKey);
  }
  // Red: la resincronización de arriba solo salta cuando cambia openGroupKey.
  // Si llega otra balda con el mismo openGroupKey pero sin el grupo que el
  // lector había abierto (p. ej. «s1#2» al cambiar de itinerario), `open`
  // apuntaría a una clave inexistente y todo quedaría apilado: se pinta el
  // grupo abierto por defecto.
  const shown = shelf.groups.some((g) => g.key === open) ? open : shelf.openGroupKey;
  const titleId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  function openGroup(key: string) {
    if (key === shown) return;
    focusAfterOpen.current = true;
    setOpen(key);
  }
  const counted = shelf.groups.reduce((s, g) => s + g.counted, 0);
  const completed = shelf.groups.reduce((s, g) => s + g.completed, 0);
  const groupName = (g: ShelfGroup) => g.name ?? sagaName;

  // Difuminados en los bordes: el scroll no se ve (sin barra), se intuye por
  // las portadas que se desvanecen en el lado hacia el que hay más.
  const [edges, setEdges] = useState({ left: false, right: false });
  function updateEdges() {
    const row = rowRef.current;
    if (!row) return;
    const left = row.scrollLeft > 4;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }
  function scrollShelf(dir: -1 | 1) {
    const row = rowRef.current;
    row?.scrollBy?.({ left: dir * row.clientWidth * 0.8, behavior: "smooth" });
  }
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    const now = row?.querySelector<HTMLElement>("[data-testid='shelf-now']");
    // Se centra moviendo SOLO la balda: scrollIntoView también desplazaba la
    // página en vertical al cargar (#1548).
    if (row && now) {
      const r = row.getBoundingClientRect();
      const n = now.getBoundingClientRect();
      row.scrollTo?.({ left: row.scrollLeft + (n.left - r.left) - (row.clientWidth - n.width) / 2 });
    }
    updateEdges();
    if (focusAfterOpen.current) {
      focusAfterOpen.current = false;
      (row?.querySelector<HTMLElement>("[data-testid='shelf-now']") ?? row?.querySelector<HTMLElement>("[data-shelf-link]"))?.focus();
    }
  }, [shown]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = [...(rowRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-shelf-link]") ?? [])];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i === -1) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  }

  // Vacía NO desaparece: la cabecera lleva los chips de itinerario y «Cómo
  // leerla →», y sin ella el lector no podría salir de una ruta sin obras.
  const empty = shelf.mode === "empty";

  const items: A11yItem[] = shelf.groups.flatMap((g) => [
    ...g.slots.flatMap((s) => slotA11y(s, t)),
    ...g.extras.map((work) => ({ work, extra: "" })),
  ]);

  return (
    <ShelfRatingsContext value={ratings ?? null}>
    <section data-testid="saga-shelf" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="mr-1 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
          {t("shelfTitle")}
        </h2>
        {routes.length > 1 &&
          routes.map((r) => (
            <Link
              key={r.slug}
              href={`${baseHref}?ruta=${encodeURIComponent(r.slug)}`}
              scroll={false}
              aria-current={r.slug === activeRoute ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${r.slug === activeRoute ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`}
            >
              {r.name}
            </Link>
          ))}
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {shelf.mode !== "start" && counted > 0 && <span data-testid="shelf-count">{t("shelfCount", { completed, total: counted })}</span>}
          <Link href={readingHref} className="font-semibold text-foreground underline-offset-2 hover:underline">
            {t("readingLink")} →
          </Link>
        </span>
      </div>

      {empty ? (
        <p data-testid="shelf-empty" className="text-xs text-muted-foreground">
          {t("shelfEmpty")}
        </p>
      ) : (
        // -mx/px: el contorno y el ✓ de la primera portada quedaban recortados
        // por el borde del scroll; el margen negativo mantiene la alineación
        // con el resto de la ficha, y los difuminados caen fuera del contenido.
        <div className="relative -mx-3">
          <div
            ref={rowRef}
            onKeyDown={onKeyDown}
            onScroll={updateEdges}
            className="flex snap-x scroll-px-3 items-end gap-4 overflow-x-auto px-3 pt-8 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {shelf.groups.map((g) =>
              g.key === shown || shelf.groups.length === 1 ? (
                <OpenGroup key={g.key} group={g} label={groupName(g)} showLabel={shelf.groups.length > 1} />
              ) : (
                <Pile key={g.key} group={g} label={groupName(g)} onOpen={() => openGroup(g.key)} />
              ),
            )}
          </div>
          <span
            aria-hidden
            data-testid="shelf-fade-left"
            className={`pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent transition-opacity ${edges.left ? "opacity-100" : "opacity-0"}`}
          />
          <span
            aria-hidden
            data-testid="shelf-fade-right"
            className={`pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent transition-opacity ${edges.right ? "opacity-100" : "opacity-0"}`}
          />
          {/* Flechas solo desde sm: en táctil se desliza con el dedo. Avanzan
              casi una pantalla de balda; el teclado sigue con las flechas del
              propio teclado sobre las portadas. */}
          {(["left", "right"] as const).map((side) =>
            edges[side] ? (
              <button
                key={side}
                type="button"
                data-testid={`shelf-scroll-${side}`}
                aria-label={t(side === "left" ? "shelfScrollLeft" : "shelfScrollRight")}
                onClick={() => scrollShelf(side === "left" ? -1 : 1)}
                className={`absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/90 text-foreground shadow-cover backdrop-blur transition-colors hover:bg-surface-muted sm:grid ${side === "left" ? "left-1" : "right-1"}`}
              >
                {side === "left" ? <ChevronLeftIcon className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
              </button>
            ) : null,
          )}
        </div>
      )}

      {!empty && shelf.groups.length > 1 && (
        <div className="flex h-2 gap-0.5">
          {shelf.segments.map((s) => {
            const g = shelf.groups.find((x) => x.key === s.groupKey);
            const pct = `${(s.done / Math.max(1, s.weight)) * 100}%`;
            return (
              <button
                key={s.groupKey}
                type="button"
                data-testid={`shelf-segment-${s.groupKey}`}
                aria-label={t("shelfSegment", { name: g ? groupName(g) : "", done: s.done, total: s.weight })}
                aria-pressed={s.groupKey === shown}
                onClick={() => openGroup(s.groupKey)}
                style={{ flexGrow: s.weight }}
                className={`relative h-full basis-0 overflow-hidden rounded-full bg-surface-muted ${s.groupKey === shown ? "ring-2 ring-foreground/30" : ""}`}
              >
                <span className="absolute inset-y-0 left-0 bg-green" style={{ width: pct }} />
                {s.hasNow && <span className="absolute inset-y-0 w-1.5 bg-accent" style={{ left: pct }} />}
              </button>
            );
          })}
        </div>
      )}

      {!empty && (
        <ol data-testid="shelf-a11y-list" className="sr-only">
          {items.map(({ work, extra }) => (
            <li key={work.key}>
              <a href={work.href} tabIndex={-1}>
                {work.title} — {t(`shelfState_${work.state}`)}
                {work.role ? `, ${t(`roleLabel.${work.role}`)}` : ""}
                {work.skipped ? `, ${t("shelfSkipped")}` : ""}
                {work.optional ? `, ${t("optionalChip")}` : ""}
                {extra}
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
    </ShelfRatingsContext>
  );
}
