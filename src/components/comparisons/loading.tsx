import styles from './loading.module.css';

/** Decorative, data-free covers: never retain another group's evidence while loading. */
export function ComparisonLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div role="status" className={`${styles.loading} ${compact ? styles.compact : ''}`}>
    <svg className={styles.art} viewBox="0 0 280 210" width="280" height="210" aria-hidden="true" focusable="false">
      <g className={styles.rings}>
        <circle className={styles.ringBook} cx="110" cy="85" r="62"/>
        <circle className={styles.ringMovie} cx="170" cy="85" r="62"/>
        <circle className={styles.ringSeries} cx="140" cy="137" r="62"/>
      </g>
      <g transform="translate(82 70)"><g className={styles.book}>
        <rect className={styles.cover} x="-18" y="-25" width="36" height="50" rx="3"/>
        <path className={styles.spine} d="M-13-23V23"/>
        <circle className={styles.ink} cx="3" cy="-5" r="8"/>
        <path className={styles.line} d="M-5 11H11M-2 16H8"/>
      </g></g>
      <g transform="translate(192 70)"><g className={styles.movie}>
        <rect className={styles.cover} x="-18" y="-25" width="36" height="50" rx="3"/>
        <path className={styles.line} d="m-11 5 9-19 12 19Z"/>
        <circle className={styles.ink} cx="7" cy="-13" r="3"/>
        <path className={styles.line} d="M-7 14H7M-4 19H4"/>
      </g></g>
      <g transform="translate(140 166)"><g className={styles.series}>
        <rect className={styles.cover} x="-18" y="-25" width="36" height="50" rx="3"/>
        <path className={styles.line} d="M-10-10H10V5H-10ZM-6 12H6M-3 17H3"/>
        <path className={styles.ink} d="m-2-7 7 5-7 4Z"/>
      </g></g>
    </svg>
    <p className={styles.label}>{label}</p>
  </div>;
}
