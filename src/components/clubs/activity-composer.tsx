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

/** Si el parámetro pide el asistente abierto. Vive junto a `proposeHref` porque
 *  son las dos caras de lo mismo: quien construye la URL y quien la lee. La
 *  comparación se hace en UN solo sitio a propósito -- repartida por la página y
 *  la cabecera, cambiar qué abre el asistente obligaría a acordarse de tres
 *  sitios y nada avisaría del que se olvide.
 *
 *  Estricto contra `"1"`: `?nueva=0` o `?nueva=loquesea` no abren nada, y una
 *  clave repetida (que Next entrega como array) tampoco. Ante la duda, cerrado. */
export function isComposerOpen(nueva: string | string[] | undefined): boolean {
  return nueva === "1";
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
