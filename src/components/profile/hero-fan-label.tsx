"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Envoltorio accesible del abanico: una región con nombre («Destacados de X»).
export function HeroFanLabel({ name, children }: { name: string; children: ReactNode }) {
  const t = useTranslations("profile.visual");
  return <nav aria-label={t("fanLabel", { name })}>{children}</nav>;
}
