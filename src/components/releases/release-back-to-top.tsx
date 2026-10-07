"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronUpIcon } from "@/components/ui/icons";
import styles from "./release-calendar.module.css";

function subscribe(listener: () => void) {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}
function isScrolled() { return window.scrollY > 480; }
function serverSnapshot() { return false; }

export function ReleaseBackToTop() {
  const t = useTranslations("releases");
  const visible = useSyncExternalStore(subscribe, isScrolled, serverSnapshot);
  if (!visible) return null;

  function returnToTop(event: MouseEvent<HTMLButtonElement>) {
    const heading = event.currentTarget.closest("#novedades-inicio")?.querySelector<HTMLElement>("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <Button type="button" variant="secondary" className={styles.backToTop + " px-3 text-xs"} onClick={returnToTop}>
    <ChevronUpIcon aria-hidden className="h-4 w-4 shrink-0" />
    {t("backToTop")}
  </Button>;
}
