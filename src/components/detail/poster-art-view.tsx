// src/components/detail/poster-art-view.tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageZoom } from "@/components/ui/image-zoom";
import type { PosterArt } from "@/lib/catalog/poster-art";

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
        <ImageZoom src={art.src} alt={title} className="absolute inset-0 block h-full w-full">
          <Image
            src={art.src}
            alt={title}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1280px) 520px, 100vw"
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
      {/* La altura cede en pantallas bajas para no meterse bajo el título. */}
      <div className="absolute top-[max(12%,56px)] left-1/2 aspect-[178/256] h-[min(256px,46%)] -translate-x-1/2 xl:top-[18%]">
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
