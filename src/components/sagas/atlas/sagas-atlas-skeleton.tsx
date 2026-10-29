import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./sagas-atlas.module.css";

// Fantasma del atlas de /sagas: el lienzo oscuro a pantalla completa, el hueco de la barra
// superior y tres manchas en fila (las zonas). Es el fallback del <Suspense> de la página.
export function SagasAtlasSkeleton() {
  return (
    <div className={styles.root} data-testid="sagas-atlas-skeleton">
      <LoadingAnnounce />
      <div className={styles.top} aria-hidden>
        <div className={`${styles.back} animate-pulse`} />
        <div className={styles.heading}>
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 96, height: 10 }} />
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 120, height: 20, marginTop: 6 }} />
          <div className={`${styles.skeletonLine} animate-pulse`} style={{ width: 260, maxWidth: "100%", height: 14, marginTop: 8 }} />
        </div>
      </div>
      <div className={styles.skeletonZones} aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={styles.skeletonZone} />
        ))}
      </div>
    </div>
  );
}
