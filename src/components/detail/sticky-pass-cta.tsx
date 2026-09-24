"use client";

import Link from "next/link";
import { PlusIcon } from "@/components/ui/icons";
import { useItemStatus } from "./item-status-context";

// La versión compacta del CTA de PassCard, para la barra de pestañas cuando se
// pega arriba (spec 2026-09-23 §1): la tarjeta no acompaña al scroll, esto sí.
// Solo con pase activo y acción disponible; ItemDetailTabs decide CUÁNDO se ve.
export function StickyPassCta({ href, label }: { href: string | null; label: string }) {
  const { status } = useItemStatus();
  if (!status || !href) return null;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap text-accent-foreground transition-colors hover:bg-accent-hover"
    >
      <PlusIcon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
