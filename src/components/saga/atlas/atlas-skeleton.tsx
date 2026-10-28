import { LoadingAnnounce } from "@/components/ui/loading-announce";
import styles from "./atlas.module.css";

// Fantasma del atlas (spec 2026-10-28): el suelo oscuro a pantalla completa con
// el hueco de la barra superior, sin datos. Es el fallback del <Suspense> de
// /saga/[id]/mapa (y del redirect de /como-leerla), para que el shell estático
// ya tenga la forma del atlas y no la de la ficha (el loading.tsx del segmento).
export function AtlasSkeleton() {
  return (
    <div className={`${styles.root} h-dvh w-full overflow-hidden`} data-testid="atlas-skeleton">
      <LoadingAnnounce />
      <div className={styles.top} aria-hidden>
        <div className={`${styles.back} animate-pulse`} />
        <div className={styles.heading}>
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 96, height: 10 }} />
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 200, height: 20, marginTop: 6 }} />
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 260, maxWidth: "100%", height: 14, marginTop: 8 }} />
        </div>
      </div>
    </div>
  );
}
