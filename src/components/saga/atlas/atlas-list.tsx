"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Insets } from "@/lib/sagas/atlas/visible-camera";
import type { Lens } from "@/lib/sagas/atlas/layout";
import { listOrder } from "@/lib/sagas/atlas/list-order";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import { SkipOptionalButton } from "./skip-optional-button";
import { useWorkFacts } from "./work-facts";
import styles from "./atlas.module.css";

/** «Ver como lista» (spec 2026-10-28 §8): el sustituto accesible del plano y del timeline
 *  retirado. Una `ol` en el orden de la lente activa; cada entrada enlaza a la ficha y cuenta
 *  en una línea de texto lo que el plano dice con posición y trazo. El estado solo con la
 *  capa Progreso, como en el plano. Ocupa la zona libre entre la barra y el dock. */
export function AtlasList({ sagaId, sagaName, model, lens, authenticated, progress, insets }: {
  sagaId: string;
  sagaName: string;
  model: AtlasModel;
  lens: Lens;
  authenticated: boolean;
  progress: boolean;
  insets: Insets;
}) {
  const t = useTranslations("saga.atlas");
  const facts = useWorkFacts(model.works);
  return (
    <div className={styles.list} style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <ol className={styles.listItems} aria-label={t("listAria", { saga: sagaName })}>
        {listOrder(model.works, lens).map((w) => {
          const f = facts(w);
          const line = [
            progress ? f.state : null, f.role?.label ?? null, f.window, f.fitsNow, f.tandem, f.tandemNote,
            f.step, f.stepNote,
          ].filter(Boolean).join(" · ");
          return (
            <li key={w.key} className={styles.listItem} data-state={w.state}>
              <div className={styles.listText}>
                {/* Nombre explícito: sin él, número y título se leen pegados («1A»). */}
                <Link href={w.href} className={styles.listLink} aria-label={w.readingNo !== null ? `${w.readingNo}. ${w.title}` : undefined}>
                  <span className={styles.listNo} aria-hidden={w.readingNo === null || undefined}>{w.readingNo ?? "·"}</span>
                  <span>{w.title}</span>
                </Link>
                {line && <p className={styles.listLine}>{line}</p>}
              </div>
              {authenticated && w.optional && <SkipOptionalButton sagaId={sagaId} work={w} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
