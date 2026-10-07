"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "@/components/ui/icons";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

const NARROW = "(max-width: 1099px)";
export function useNarrowHome() {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(NARROW);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

const Panels = createContext<{ active: string | null; setActive: Dispatch<SetStateAction<string | null>> } | null>(null);

/** Coordina solo la identidad del bloque abierto; los slots siguen en servidor. */
export function HomePanelsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const mobile = useNarrowHome();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useLayoutEffect(() => () => setActive(null), []);
  useEffect(() => {
    if (!mobile || previousPath.current !== pathname) setActive(null);
    previousPath.current = pathname;
  }, [mobile, pathname]);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <Panels.Provider value={value}>{children}</Panels.Provider>;
}

export type HomePanelLabels = { title: string; openLabel: string; closeLabel: string };

export function HomeExpandable({ title, openLabel, closeLabel, summary, quickAction, focus, sectionHeading, children, className = "" }: HomePanelLabels & {
  summary: ReactNode;
  quickAction?: ReactNode;
  /** Una única tarjeta cambia de composición; el resto se despliega debajo. */
  focus?: ReactNode;
  sectionHeading?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const mobile = useNarrowHome();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const group = useContext(Panels);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [local, setLocal] = useState(false);
  useLayoutEffect(() => () => setLocal(false), []);
  const expanded = mobile && (group ? group.active === id : local);
  const setActive = group?.setActive;
  const change = useCallback((value: boolean) => {
    if (setActive) setActive(value ? id : null);
    else setLocal(value);
  }, [id, setActive]);

  // Respaldo para el componente aislado; en Inicio el provider limpia la ruta.
  useEffect(() => {
    if (!mobile || previousPath.current !== pathname) setLocal(false);
    previousPath.current = pathname;
  }, [mobile, pathname]);

  const close = useCallback(() => {
    change(false);
    const trigger = triggerRef.current;
    trigger?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (!trigger?.isConnected || trigger.inert) return;
      trigger.focus({ preventScroll: true });
      const box = trigger.getBoundingClientRect();
      if (box.top < 72 || box.bottom > window.innerHeight - 80) {
        trigger.scrollIntoView?.({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
      }
    });
  }, [change, reduced]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      // Las hojas de sesión y el reproductor conservan su propio Escape.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Activity conserva nodos de hojas interceptadas con open=true, aunque
      // estén ocultos. Solo una hoja renderizada debe recibir este Escape.
      const visibleSheet = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"))
        .some((dialog) => dialog.getClientRects().length > 0);
      if (visibleSheet) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, close]);

  if (focus) return (
    <div className={`home-panel home-focus-panel ${className}`} data-expanded={expanded ? "true" : undefined}>
      <div className="home-focus-heading">
        {sectionHeading}
        <button type="button" className="home-focus-collapse" aria-label={`${closeLabel}: ${title}`}
          aria-hidden={!mobile || !expanded} inert={!mobile || !expanded} onClick={close}>
          <ChevronRightIcon className="h-4 w-4 -rotate-90" />
        </button>
      </div>
      <div className="home-focus-stage">
        {/* El botón cubre la tarjeta recogida sin envolver sus enlaces/acciones. */}
        <button ref={triggerRef} type="button" className="home-panel-trigger home-focus-trigger" aria-label={openLabel}
          aria-expanded={expanded} aria-controls={id} aria-hidden={!mobile || expanded} inert={!mobile || expanded} onClick={() => {
            change(true);
            requestAnimationFrame(() => {
              if (triggerRef.current?.getAttribute("aria-expanded") !== "true") return;
              document.getElementById(id)?.querySelector<HTMLElement>(".home-focus-card")?.focus({ preventScroll: true });
            });
          }}>
          <span className="sr-only">{summary}</span>
        </button>
        {quickAction && <div className="home-panel-quick home-focus-quick" aria-hidden={!mobile || expanded} inert={!mobile || expanded}>{quickAction}</div>}
        <section id={id} role="region" aria-label={title} aria-hidden={mobile && !expanded ? true : undefined}
          inert={mobile && !expanded} className="home-focus-region">
          {focus}
          <div className="home-panel-details" data-expanded={expanded ? "true" : undefined}>
            <div className="home-panel-clip"><div className="home-panel-surface">
              <div className="home-panel-body">{children}</div>
              <footer className="home-panel-footer"><button type="button" className="home-panel-collapse" aria-label={`${closeLabel}: ${title}`} onClick={close}>{closeLabel}</button></footer>
            </div></div>
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className={`home-panel ${className}`} data-expanded={expanded ? "true" : undefined}>
      <div className="home-panel-summary">
        <button ref={triggerRef} type="button" className="home-panel-trigger" aria-label={expanded ? `${closeLabel}: ${title}` : openLabel}
          aria-expanded={expanded} aria-controls={id} onClick={() => expanded ? close() : change(true)}>
          <span className="home-summary-compact">{summary}</span>
          <span className="home-summary-expanded">{title}<ChevronRightIcon className="h-4 w-4 -rotate-90" /></span>
        </button>
        {quickAction && <div className="home-panel-quick">{quickAction}</div>}
      </div>
      <section id={id} role="region" aria-label={title} aria-hidden={mobile && !expanded ? true : undefined}
        inert={mobile && !expanded} data-expanded={expanded ? "true" : undefined} className="home-panel-details">
        <div className="home-panel-clip"><div className="home-panel-surface">
          <header className="home-panel-header">
            <h2 className="font-serif text-xl font-semibold">{title}</h2>
            <button type="button" className="home-panel-close" aria-label={closeLabel} onClick={close}><ChevronRightIcon className="h-4 w-4 -rotate-90" /></button>
          </header>
          <div className="home-panel-body">{children}</div>
          <footer className="home-panel-footer"><button type="button" className="home-panel-collapse" aria-label={`${closeLabel}: ${title}`} onClick={close}>{closeLabel}</button></footer>
        </div></div>
      </section>
    </div>
  );
}
