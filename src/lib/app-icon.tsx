export function AppIconMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Satori no resuelve CSS vars: espejo manual de --accent /
        // --accent-foreground (modo claro) de globals.css.
        background: "#b0542f",
        color: "#fff5ef",
        fontFamily: "serif",
        fontSize: size * 0.58,
        fontWeight: 600,
      }}
    >
      B
    </div>
  );
}
