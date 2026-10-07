"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { XIcon } from "@/components/ui/icons";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import { animateHomePanel, type PanelRect } from "./panel-motion";

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
export type HomePanelLabels = { title: string; openLabel: string; closeLabel: string };

export function HomeExpandable({ title, openLabel, closeLabel, summary, quickAction, children, className = "" }: HomePanelLabels & {
  summary: ReactNode; quickAction?: ReactNode; children: ReactNode; className?: string;
}) {
  const mobile = useNarrowHome();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const origin = useRef<PanelRect | null>(null);
  const active = useRef(false);
  const busy = useRef(false);
  const closing = useRef(false);
  const generation = useRef(0);
  const previousOverflow = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function unlock() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  function cancelMotion() {
    dialogRef.current?.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
  }
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    generation.current += 1;
    cancelMotion();
    busy.current = false;
    closing.current = false;
    if (mobile) {
      if (!active.current && dialog.open) dialog.close();
    } else {
      if (active.current) dialog.close();
      dialog.setAttribute("open", "");
      active.current = false;
      unlock();
    }
    return () => {
      generation.current += 1;
      cancelMotion();
      if (active.current) dialog.close();
      unlock();
    };
  }, [mobile]);

  // Cache Components conserva la ruta oculta. El top layer y su bloqueo de
  // scroll deben cerrarse al navegar, aunque el contenido no se desmonte.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    generation.current += 1;
    cancelMotion();
    if (active.current) dialogRef.current?.close();
    unlock();
  }, [pathname]);

  async function open() {
    const dialog = dialogRef.current;
    if (!dialog || !mobile || busy.current || active.current) return;
    busy.current = true;
    const current = ++generation.current;
    origin.current = triggerRef.current?.closest(".home-panel-summary")?.getBoundingClientRect() ?? null;
    if (dialog.open) dialog.close();
    active.current = true;
    dialog.dataset.expanded = "true";
    setExpanded(true);
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    await animateHomePanel(dialog, origin.current, reduced);
    if (generation.current !== current) return;
    busy.current = false;
  }
  async function close() {
    const dialog = dialogRef.current;
    if (!dialog || !active.current || closing.current) return;
    closing.current = true;
    busy.current = true;
    cancelMotion();
    const current = ++generation.current;
    await animateHomePanel(dialog, origin.current, reduced, true);
    if (generation.current !== current) return;
    dialog.close();
  }
  function finishClose() {
    const wasActive = active.current;
    active.current = false;
    busy.current = false;
    closing.current = false;
    setExpanded(false);
    unlock();
    if (wasActive && mobile) triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className={`home-panel ${className}`}>
      <div className="home-panel-summary">
        <button ref={triggerRef} type="button" className="home-panel-trigger" aria-label={openLabel} aria-haspopup="dialog" onClick={open}>{summary}</button>
        {quickAction && <div className="home-panel-quick">{quickAction}</div>}
      </div>
      <dialog ref={dialogRef} open role={mobile ? "dialog" : "region"} aria-label={title}
        aria-modal={expanded ? true : undefined} data-expanded={expanded ? "true" : undefined}
        className="home-panel-dialog" onClose={finishClose}
        onCancel={(event) => { event.preventDefault(); void close(); }}
        onClick={(event) => { if (event.target === event.currentTarget) void close(); }}>
        <div className="home-panel-surface"><header className="home-panel-header"><h2 className="font-serif text-xl font-semibold">{title}</h2><button type="button" className="home-panel-close" aria-label={closeLabel} onClick={close}><XIcon className="h-4 w-4" /></button></header>
        <div className="home-panel-body">{children}</div></div>
      </dialog>
    </div>
  );
}
