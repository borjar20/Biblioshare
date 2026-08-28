import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

// Bienvenida de la columna de estadísticas cuando está fría (sin actividad ni
// meta): en vez de ceros y barras vacías, una tarjeta editorial con salida a
// generar el primer dato. `compact` = variante de <1100 (una línea + CTA
// primario, sin encabezado, igual criterio que el resumen de tres cifras que
// sustituye). El CTA de meta lleva al Rincón del perfil, donde viven retos y
// meta diaria; fijar una meta enciende el bloque de año al instante.
export async function StatsWelcome({
  username,
  compact = false,
}: {
  username: string;
  compact?: boolean;
}) {
  const t = await getTranslations("statsRail");
  return (
    <div className="rounded-card border border-border bg-surface shadow-card p-4">
      {!compact && (
        <p className="font-serif text-[15px] font-semibold text-foreground">
          {t("welcomeTitle")}
        </p>
      )}
      <p className={`text-[13px] leading-relaxed text-muted-foreground ${compact ? "" : "mt-1.5"}`}>
        {t("welcomeBody")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* `secondary`, no `primary`: en el arranque en frío esta tarjeta se
            pinta a la vez que el CTA de la columna personal y que el del feed
            vacío, y eran TRES naranjas simultáneos ante quien no tiene ni idea
            de por dónde empezar — justo el caso en el que el primario tenía que
            servir de brújula. El único primario de la vista es el de la columna
            personal: fijar una meta no vale de nada sin obras que contar. */}
        <Link href={`/u/${username}?tab=rincon`} className={buttonVariants("secondary")}>
          {t("welcomeGoalCta")}
        </Link>
        {!compact && (
          <Link href="/coleccion" className={buttonVariants("secondary")}>
            {t("welcomeExploreCta")}
          </Link>
        )}
      </div>
    </div>
  );
}
