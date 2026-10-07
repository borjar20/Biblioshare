"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import type { PanelRect } from "@/components/home/panel-motion";

const Player = dynamic(() => import("./story-player").then((module) => module.StoryPlayer), { ssr: false });

export function HomeWrapUp({ wrapUp, models, desktopCover, summary, openLabel }: {
  wrapUp: OwnWrapUp; models: PosterModel[]; desktopCover: ReactNode; summary: ReactNode; openLabel: string;
}) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const trigger = useRef<HTMLButtonElement>(null);
  // La selección del servidor puede cambiar tras marcar vista una crónica.
  // La que se abrió queda fijada hasta cerrar; no salta a otra semana/mes.
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
  return <div className="home-wrap-entry">
    <div className="home-wrap-desktop">{desktopCover}</div>
    <button ref={trigger} type="button" className="home-wrap-preview" aria-label={openLabel} aria-haspopup="dialog"
      onClick={() => setOpened({ wrapUp, models, origin: trigger.current?.getBoundingClientRect() ?? null })}>{summary}</button>
    {opened && <Player wrapUp={opened.wrapUp} models={opened.models} originRect={opened.origin} onClose={() => { setOpened(null); trigger.current?.focus({ preventScroll: true }); }} />}
  </div>;
}
