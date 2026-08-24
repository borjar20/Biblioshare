"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// «3 abandonados ocultos · Mostrar». Es la contrapartida obligatoria de ocultar
// cosas: sin ella, una rejilla que enseña menos de lo que hay —o que se queda
// vacía entera— no tiene explicación ni salida.
//
// Es componente CLIENTE por un motivo concreto: se monta desde /coleccion (un
// server component) y también desde CollectionItems, que es cliente. Un server
// component no puede montarse dentro de uno de cliente, así que la versión de
// cliente es la única que sirve en los dos sitios.
export function HiddenDroppedNote({
  count,
  href,
}: {
  count: number;
  /** Enlace que anula la preferencia en ESTA vista (`?abandonados=1`). */
  href: string;
}) {
  const t = useTranslations("library");
  if (count <= 0) return null;

  return (
    <p className="text-center text-[12.5px] text-muted-foreground">
      {t("hiddenDropped", { count })}{" "}
      <span aria-hidden>·</span>{" "}
      <Link href={href} className="font-medium text-accent hover:underline">
        {t("hiddenDroppedAction")}
      </Link>
    </p>
  );
}
