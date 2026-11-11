// src/components/detail/poster-art-view.tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageZoom } from "@/components/ui/image-zoom";
import type { PosterArt } from "@/lib/catalog/poster-art";

// Grano suave sobre la portada difuminada (spec 2026-11-09).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// El botón a sangre llena un contenedor con overflow-hidden, y su imagen queda bajo
// el degradado: un outline se recortaría y se apagaría. El anillo es un ::after
// interior que sube por encima del degradado. El `!` hace falta porque la regla
// global de :focus-visible va sin capa y ganaría a una utilidad.
const BLEED_FOCUS_RING =
  "focus-visible:outline-none! focus-visible:after:absolute focus-visible:after:inset-1 focus-visible:after:z-[1] focus-visible:after:rounded-[3px] focus-visible:after:border-2 focus-visible:after:border-accent focus-visible:after:shadow-[0_0_0_2px_var(--background)]";

// Las tres formas del cartel (spec 2026-11-09). Llena su contenedor, que es
// quien fija el tamaño. Si la imagen falla, cae a la forma tipográfica.
export function PosterArtView({ art, title }: { art: PosterArt; title: string }) {
  const src = art.kind === "type" ? null : art.src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  const onError = () => setFailedSrc(src);

  if (art.kind === "type" || failed) {
    return (
      <div
        data-poster="type"
        aria-hidden
        className="absolute inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 70% at 75% 8%, oklch(0.55 0.12 var(--work-hue)) 0, transparent 62%), radial-gradient(90% 60% at 10% 35%, oklch(0.45 0.1 calc(var(--work-hue) + 40)) 0, transparent 60%), var(--background)",
        }}
      >
        <span
          className="absolute top-10 -left-3 whitespace-nowrap uppercase opacity-20"
          style={{
            fontFamily: "var(--font-poster), sans-serif",
            fontSize: "clamp(180px, 34vw, 320px)",
            lineHeight: 0.82,
            color: "var(--work-title)",
          }}
        >
          {title}
        </span>
      </div>
    );
  }

  if (art.kind === "bleed") {
    return (
      <div data-poster="bleed" className="absolute inset-0">
        {/* h-full w-full además de inset-0: un <button> absoluto no se estira solo. */}
        <ImageZoom src={art.src} alt={title} className={`absolute inset-0 block h-full w-full ${BLEED_FOCUS_RING}`}>
          <Image
            src={art.src}
            alt={title}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1024px) 520px, 100vw"
            onError={onError}
            className="object-cover object-top"
          />
        </ImageZoom>
      </div>
    );
  }

  return (
    <div data-poster="atmosphere" className="absolute inset-0 overflow-hidden">
      <Image
        src={art.src}
        alt=""
        fill
        aria-hidden
        sizes="180px"
        className="scale-125 object-cover opacity-90 blur-3xl saturate-[1.3]"
      />
      <div
        data-grain
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{ backgroundImage: GRAIN, backgroundSize: "160px 160px" }}
      />
      {/* La altura cede en pantallas bajas para no meterse bajo el título. Con foco
          sube sobre el degradado, para que el anillo se vea entero. */}
      <div className="absolute top-[max(12%,56px)] left-1/2 aspect-[178/256] h-[min(256px,46%)] -translate-x-1/2 has-[:focus-visible]:z-[1] lg:top-[18%]">
        <ImageZoom
          src={art.src}
          alt={title}
          className="relative block h-full w-full overflow-hidden rounded-[3px] shadow-[0_26px_40px_-16px_rgba(0,0,0,0.85)]"
        >
          <Image
            src={art.src}
            alt={title}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="180px"
            onError={onError}
            className="object-cover"
          />
        </ImageZoom>
      </div>
    </div>
  );
}
