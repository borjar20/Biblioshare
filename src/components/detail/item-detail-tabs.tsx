"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useItemStatus } from "./item-status-context";
import { DETAIL_CONTAINER } from "./detail-container";
import { detailTabOrder, clampDetailTab, type DetailTabId } from "./tab-visibility";

export function ItemDetailTabs({
  tablistLabel, labels, info, episodes, community, reviews, log, stickyAction, inlineLog = false,
  logLinkLabel, logPreview,
}: {
  tablistLabel: string;
  labels: Partial<Record<DetailTabId | "episodes" | "community" | "back", string>>;
  info: ReactNode;
  episodes?: ReactNode;
  community: ReactNode;
  reviews?: ReactNode;
  log: ReactNode;
  stickyAction?: ReactNode;
  inlineLog?: boolean;
  logLinkLabel?: string;
  logPreview?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const followed = useItemStatus().status !== null;
  const order = detailTabOrder(followed, inlineLog);
  const tab = clampDetailTab(requested, order);
  const hasTabs = order.length > 1;
  const hasInlineLog = inlineLog && followed;
  const panelRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const section = requested === "community" || (requested === "episodes" && episodes)
    || (requested === "log" && hasInlineLog) ? requested : null;
  useEffect(() => {
    if (section) document.getElementById(`detail-${section}`)?.scrollIntoView({ block: "start" });
  }, [section]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !stickyAction || !hasTabs) return;
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 59;
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < topbar);
    }, { rootMargin: `-${topbar}px 0px 0px 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stickyAction, hasTabs]);

  function selectTab(id: DetailTabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "info") params.delete("tab");
    else params.set("tab", id);
    const query = params.toString();
    // Both panels are already supplied by the server. Only the local URL state changes.
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function fromContext(id: DetailTabId) {
    selectTab(id);
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ block: "start" });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: DetailTabId;
    switch (event.key) {
      case "Home": next = order[0]; break;
      case "End": next = order[order.length - 1]; break;
      case "ArrowLeft":
      case "ArrowRight": next = order[1 - index]; break;
      default: return;
    }
    event.preventDefault();
    selectTab(next);
    document.getElementById(`item-tab-${next}`)?.focus();
  }

  const sectionOffset = "scroll-mt-[calc(var(--topbar-h)+60px)]";
  return (
    <div className="flex flex-col">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasTabs && (
        <div className="sticky top-[var(--topbar-h)] z-10 hidden border-b border-border bg-background/90 backdrop-blur-md lg:block">
          <div className={`${DETAIL_CONTAINER} flex items-center gap-4`}>
            <div role="tablist" aria-label={tablistLabel} className="flex flex-1 gap-7">
              {order.map((id, i) => (
                <button key={id} type="button" role="tab" id={`item-tab-${id}`}
                  aria-selected={id === tab} aria-controls={`item-tabpanel-${id}`}
                  tabIndex={id === tab ? 0 : -1} onClick={() => selectTab(id)}
                  onKeyDown={event => onTabKey(event, i)}
                  className={`relative py-3.5 text-sm ${id === tab ? "font-semibold" : "text-muted-foreground"}`}>
                  {labels[id]}
                  {id === tab && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                </button>
              ))}
            </div>
            {stickyAction && <div data-testid="tabs-sticky-action" className={stuck ? "hidden lg:flex" : "hidden"}>{stickyAction}</div>}
          </div>
        </div>
      )}
      <div ref={panelRef} id={`item-tabpanel-${tab}`} role={hasTabs ? "tabpanel" : "region"}
        aria-label={labels[tab]} tabIndex={0} className={`${DETAIL_CONTAINER} ${sectionOffset} py-6 lg:pb-10`}>
        {tab === "log" ? (
          <>
            <button type="button" data-testid="detail-back" className="mb-5 text-sm underline lg:hidden"
              onClick={() => fromContext("info")}>{labels.back ?? labels.info}</button>
            {log}
          </>
        ) : (
          <div className="flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(210px,32%)] xl:grid-rows-[auto_1fr] xl:items-start">
            {hasInlineLog && <a href="#detail-log" className="order-first text-sm font-semibold underline underline-offset-4 xl:hidden">{logLinkLabel ?? labels.log}</a>}
            {hasTabs && <div className="order-first flex flex-col items-start gap-2 xl:col-start-2 xl:row-start-1">
              <h2 className="label-section hidden xl:block">{labels.log}</h2>
              {logPreview}
              <button type="button" data-testid="detail-open-log" className="text-sm font-semibold text-accent-ink underline underline-offset-4"
                onClick={() => fromContext("log")}>{logLinkLabel ?? labels.log}</button>
            </div>}
            <div className="flex min-w-0 flex-col gap-8 xl:col-start-1 xl:row-start-1 xl:row-span-2">
              <div className={followed && episodes ? "order-2" : ""}>{info}</div>
              {episodes && <section id="detail-episodes" aria-label={labels.episodes} className={sectionOffset}>{episodes}</section>}
            </div>
            <div className="min-w-0 space-y-8 xl:col-start-2">
              {hasInlineLog && <section id="detail-log" aria-label={labels.log} className={sectionOffset}>{log}</section>}
              <section id="detail-community" aria-label={labels.community} className={sectionOffset}>{community}</section>
            </div>
            {reviews && <div className="min-w-0 empty:hidden xl:col-span-2">{reviews}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
