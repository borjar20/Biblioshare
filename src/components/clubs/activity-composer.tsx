"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { proposeHref } from "@/lib/clubs/activities/propose-url";
import { ProposeWizard } from "./propose/propose-wizard";

// `proposeHref` e `isComposerOpen` viven en @/lib/clubs/activities/propose-url,
// NO aquí: este fichero es "use client", y en Next 16 eso convierte hasta una
// función pura en referencia de cliente -- llamarla desde un Server Component
// devuelve un 500 en tiempo de ejecución que ni tsc ni next build detectan
// (issue #595). Un fichero "use client" exporta componentes, no utilidades.

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
    // Abrir hace PUSH (el <Link> normal) y cerrar hace replace. Es asimétrico a
    // propósito, y la tentación de igualarlo con `replace` aquí está probada y
    // es peor: se llega a esta pestaña con un push desde las pestañas del club,
    // así que un replace al abrir SOBRESCRIBE la entrada de Actividades en vez
    // de apilarse encima -- y entonces "atrás" desde el asistente no vuelve a la
    // lista, salta a la pantalla anterior a ella. El coste de dejarlo en push es
    // una entrada duplicada por ciclo abrir/cancelar: molesto, pero nunca te
    // saca de donde estabas.
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
