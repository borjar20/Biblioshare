"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/brand/brand-mark";

// Overlay de carga cold-start. Se renderiza en el HTML SSR (cubre desde el
// primer paint, sin flash de app-antes-de-splash) y se desvanece tras la
// hidratación: tiempo mínimo visible para que la marca se registre + fade.
// No depende de datos, solo de que el cliente monte.
const MIN_VISIBLE_MS = 650;
const FADE_MS = 400;

type Phase = "visible" | "fading" | "gone";

export function SplashScreen() {
  const t = useTranslations("splash");
  const [phase, setPhase] = useState<Phase>("visible");

  // Tras el min-visible, o desvanece o (si el usuario prefiere sin
  // movimiento) desaparece de golpe.
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => setPhase(reduce ? "gone" : "fading"), MIN_VISIBLE_MS);
    return () => clearTimeout(id);
  }, []);

  // Al acabar el fade, se desmonta para no bloquear taps.
  useEffect(() => {
    if (phase !== "fading") return;
    const id = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  const tagline = t("tagline");
  return (
    <div
      role="status"
      aria-label={tagline}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--accent)",
        color: "#fff5ef",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        opacity: phase === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    >
      <BrandMark height={120} />
      <div style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 600, fontSize: 34 }}>
        Biblioshare
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,245,239,0.7)",
        }}
      >
        {tagline}
      </div>
    </div>
  );
}
