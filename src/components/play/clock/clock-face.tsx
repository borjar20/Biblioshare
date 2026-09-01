const TAU = Math.PI * 2;

/**
 * Esfera viva del setup (spec reloj-visual §2): arco sombreado proporcional a
 * los minutos elegidos (desde las 12, horario) con la aguja en su borde; más
 * de 60 min llena la esfera y la aguja marca el resto de la segunda vuelta
 * (anillo discontinuo la insinúa). Presentacional puro, aria-hidden — la
 * lectura textual va fuera.
 */
export function ClockFace({ minutes }: { minutes: number }) {
  const frac = Math.min(minutes, 60) / 60;
  const over = minutes > 60;
  const needleFrac = over ? (minutes % 60) / 60 : frac;
  const needleAngle = -Math.PI / 2 + needleFrac * TAU;
  const arcEnd = -Math.PI / 2 + frac * TAU;

  const arcPath = (() => {
    if (frac >= 1 || minutes <= 0) return null;
    const x = 50 + 38 * Math.cos(arcEnd);
    const y = 50 + 38 * Math.sin(arcEnd);
    const large = frac > 0.5 ? 1 : 0;
    return `M 50 50 L 50 12 A 38 38 0 ${large} 1 ${x} ${y} Z`;
  })();

  return (
    <svg viewBox="0 0 100 100" className="h-36 w-36" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="2.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const ang = (i * TAU) / 12 - Math.PI / 2;
        return (
          <line
            key={i}
            x1={50 + 40 * Math.cos(ang)}
            y1={50 + 40 * Math.sin(ang)}
            x2={50 + 44 * Math.cos(ang)}
            y2={50 + 44 * Math.sin(ang)}
            stroke="var(--play-rail)"
            strokeWidth={i % 3 === 0 ? 2 : 1}
          />
        );
      })}
      {frac >= 1 ? (
        <circle cx="50" cy="50" r="38" fill="color-mix(in srgb, var(--accent) 20%, transparent)" />
      ) : arcPath ? (
        <path d={arcPath} fill="color-mix(in srgb, var(--accent) 20%, transparent)" />
      ) : null}
      {over ? (
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke="color-mix(in srgb, var(--accent) 45%, transparent)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      ) : null}
      <line
        x1="50"
        y1="50"
        x2={50 + 36 * Math.cos(needleAngle)}
        y2={50 + 36 * Math.sin(needleAngle)}
        stroke="var(--accent-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="3" fill="var(--accent-ink)" />
    </svg>
  );
}
