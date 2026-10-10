"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import type { PanelRect } from "@/components/home/panel-motion";

const Player = dynamic(() => import("./story-player").then((module) => module.StoryPlayer), { ssr: false });

export function HomeWrapUp({ wrapUp, models, available, desktopCover, summary, openLabel }: {
  wrapUp: OwnWrapUp; models: PosterModel[]; available?: { wrapUp: OwnWrapUp; models: PosterModel[] }[]; desktopCover: ReactNode; summary: ReactNode; openLabel: string;
}) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const trigger = useRef<HTMLButtonElement>(null);
  // La fecha puede ocupar varias líneas: Novedades se coloca debajo de la
  // altura real del resumen, también mientras la crónica ensancha.
  useEffect(() => {
    const preview = trigger.current;
    const personal = preview?.closest<HTMLElement>(".home-personal");
    if (!preview || !personal) return;
    const measure = () => {
      const height = preview.getBoundingClientRect().height;
      if (height > 0) personal.style.setProperty("--home-wrap-height", `${height}px`);
      else personal.style.removeProperty("--home-wrap-height");
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(preview);
    return () => { observer?.disconnect(); personal.style.removeProperty("--home-wrap-height"); };
  }, []);
  // La selección del servidor puede cambiar tras marcar vista una crónica.
  // La identidad queda fijada hasta cerrar; sus datos sí siguen la respuesta
  // actual del servidor para que publicar/actualizar cambie los controles.
  const [opened, setOpened] = useState<{ wrapUp: OwnWrapUp; models: PosterModel[]; origin: PanelRect | null } | null>(null);
  useEffect(() => {
    if (!opened) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [opened]);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setOpened(null);
  }, [pathname]);
  const current = opened && (available?.find((entry) => entry.wrapUp.kind === opened.wrapUp.kind) ?? opened);
  return <div className="home-wrap-entry">
    <div className="home-wrap-desktop">{desktopCover}</div>
    <button ref={trigger} type="button" className="home-wrap-preview" aria-label={openLabel} aria-haspopup="dialog"
      onClick={() => setOpened({ wrapUp, models, origin: trigger.current?.getBoundingClientRect() ?? null })}>{summary}</button>
    {opened && current && <Player wrapUp={current.wrapUp} models={current.models} originRect={opened.origin} onClose={() => { setOpened(null); trigger.current?.focus({ preventScroll: true }); }} />}
  </div>;
}
