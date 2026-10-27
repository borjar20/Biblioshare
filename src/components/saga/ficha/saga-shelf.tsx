"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { Shelf, ShelfGroup, ShelfSlot, ShelfWork } from "@/lib/sagas/derive-shelf";
import { OpenGroup, Pile } from "./saga-shelf-parts";

type A11yItem = { work: ShelfWork; extra: string };
type T = ReturnType<typeof useTranslations>;

function slotA11y(s: ShelfSlot, t: T): A11yItem[] {
  if (s.kind === "tandem") return s.works.map((work) => ({ work, extra: `, ${t("shelfTandem")}` }));
  if (s.kind === "window")
    return [{ work: s.work, extra: `, ${t("shelfWindowA11y", { after: s.afterTitle ?? "—", before: s.beforeTitle ?? "—" })}` }];
  return [{ work: s.work, extra: "" }];
}

// La balda de la ficha de saga (spec 2026-10-27 §2). Solo pinta lo que decide
// `deriveShelf`; el único estado propio es QUÉ grupo está desplegado.
export function SagaShelf({
  shelf, sagaName, routes, activeRoute, baseHref, readingHref,
}: {
  shelf: Shelf;
  sagaName: string;
  routes: Array<{ slug: string; name: string }>;
  activeRoute: string;
  baseHref: string;
  readingHref: string;
}) {
  const t = useTranslations("saga");
  const [open, setOpen] = useState(shelf.openGroupKey);
  const rowRef = useRef<HTMLDivElement>(null);
  const counted = shelf.groups.reduce((s, g) => s + g.counted, 0);
  const completed = shelf.groups.reduce((s, g) => s + g.completed, 0);
  const groupName = (g: ShelfGroup) => g.name ?? sagaName;

  useEffect(() => {
    rowRef.current?.querySelector("[data-testid='shelf-now']")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = [...(rowRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-shelf-link]") ?? [])];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i === -1) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  }

  if (shelf.mode === "empty") return null;

  const items: A11yItem[] = shelf.groups.flatMap((g) => [
    ...g.slots.flatMap((s) => slotA11y(s, t)),
    ...g.extras.map((work) => ({ work, extra: "" })),
  ]);

  return (
    <section data-testid="saga-shelf" aria-labelledby="shelf-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="shelf-title" className="mr-1 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
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
          {shelf.mode !== "start" && counted > 0 && <span>{t("shelfCount", { completed, total: counted })}</span>}
          <Link href={readingHref} className="font-semibold text-foreground underline-offset-2 hover:underline">
            {t("readingLink")} →
          </Link>
        </span>
      </div>

      <div ref={rowRef} onKeyDown={onKeyDown} className="flex snap-x items-end gap-4 overflow-x-auto pt-8 pb-2">
        {shelf.groups.map((g) =>
          g.key === open || shelf.groups.length === 1 ? (
            <OpenGroup key={g.key} group={g} label={groupName(g)} showLabel={shelf.groups.length > 1} />
          ) : (
            <Pile key={g.key} group={g} label={groupName(g)} onOpen={() => setOpen(g.key)} />
          ),
        )}
      </div>

      {shelf.groups.length > 1 && (
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
                onClick={() => setOpen(s.groupKey)}
                style={{ flexGrow: s.weight }}
                className={`relative h-full basis-0 overflow-hidden rounded-full bg-surface-muted ${s.groupKey === open ? "ring-2 ring-foreground/30" : ""}`}
              >
                <span className="absolute inset-y-0 left-0 bg-green" style={{ width: pct }} />
                {s.hasNow && <span className="absolute inset-y-0 w-1.5 bg-accent" style={{ left: pct }} />}
              </button>
            );
          })}
        </div>
      )}

      <ol data-testid="shelf-a11y-list" className="sr-only">
        {items.map(({ work, extra }) => (
          <li key={work.key}>
            <a href={work.href}>
              {work.title} — {t(`shelfState_${work.state}`)}
              {work.role ? `, ${t(`roleLabel.${work.role}`)}` : ""}
              {work.optional ? `, ${t("optionalChip")}` : ""}
              {extra}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
