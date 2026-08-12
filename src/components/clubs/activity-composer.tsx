"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { ProposeWizard } from "./propose/propose-wizard";

/** El href único de "proponer". Los TRES puntos de entrada (cabecera de
 *  escritorio, cabecera móvil, estado vacío de Próximas) apuntan aquí, y hay una
 *  sola instancia del asistente. */
export function proposeHref(clubSlug: string): string {
  return `/club/${clubSlug}?tab=actividades&nueva=1`;
}

// El botón. Es un <Link>, no un <button> con estado: así puede vivir en la
// cabecera del shell (servidor) mientras el asistente vive en el contenido.
export function ProposeActivityLink({
  clubSlug,
  className = "",
}: {
  clubSlug: string;
  className?: string;
}) {
  const t = useTranslations("activity");
  return (
    <Link href={proposeHref(clubSlug)} className={buttonVariants("primary", className)}>
      {/* El "+" es decoración de la maqueta, no parte del nombre del botón: sin
          aria-hidden se cuela en el nombre accesible y quien use lector de
          pantalla oye el glifo. */}
      <span aria-hidden>+</span> {t("propose")}
    </Link>
  );
}

// El asistente. Se monta cuando ?nueva=1 está en la URL; cerrarlo o proponer lo
// quita. Al proponer no hace falta refrescar la lista a mano: proposeActivity
// revalida y la RSC vuelve con la propuesta nueva.
export function ActivityComposer({
  clubId,
  clubSlug,
  isModerator,
  open,
}: {
  clubId: string;
  /** Solo lo necesita la rama de evento del asistente, que navega a la ficha
   *  recién creada porque un evento ya no aparece en este listado. */
  clubSlug: string;
  isModerator: boolean;
  open: boolean;
}) {
  const router = useRouter();
  if (!open) return null;

  function cerrar() {
    router.replace(`/club/${clubSlug}?tab=actividades`);
  }

  return (
    <ProposeWizard
      clubId={clubId}
      clubSlug={clubSlug}
      isModerator={isModerator}
      onProposed={cerrar}
      onCancel={cerrar}
    />
  );
}
