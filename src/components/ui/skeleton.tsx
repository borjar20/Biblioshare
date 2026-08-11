import type { ComponentProps, ReactNode } from "react";

// Skeletons de carga (Paper). Bloques neutros en `animate-pulse` sobre
// `surface-muted` que RESERVAN las dimensiones reales del contenido, para que
// al llegar los datos no haya salto de layout (CLS). Son decorativos:
// `aria-hidden`. El anuncio para lectores de pantalla lo pone `LoadingAnnounce`
// (en `loading-announce.tsx`, aparte porque usa i18n de servidor y estos
// primitivos deben poder usarse también desde client components).
export function Skeleton({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-chip bg-surface-muted ${className}`}
      {...props}
    />
  );
}

// Línea de texto. El ancho se controla desde fuera (p. ej. `w-3/4`).
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-3.5 rounded-full ${className}`} />;
}

// Portada 2/3: el elemento cover-forward dominante de listas, grids y hero.
export function SkeletonCover({ className = "" }: { className?: string }) {
  return (
    <Skeleton className={`aspect-[2/3] w-full rounded-cover ${className}`} />
  );
}

// Avatar circular.
export function SkeletonAvatar({ className = "size-9" }: { className?: string }) {
  return <Skeleton className={`shrink-0 rounded-full ${className}`} />;
}

// Chrome real de una tarjeta (radio 14 + borde + sombra) con contenido skeleton
// dentro: solo pulsa el interior, el marco ya está en su sitio.
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-4 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

// Rejilla de portadas (2→5 col) con su línea de título debajo, igual que los
// grids reales de Colección/Buscar/Perfil. Centralizar las clases mantiene
// alineadas las dimensiones (anti-CLS).
//
// `cols` existe porque las breakpoints de Tailwind miran el VIEWPORT, no el
// contenedor: la rejilla ancha de `Colección › Todo` llega a 8 columnas en 2xl
// y necesita que su skeleton haga lo mismo, mientras que las demás (que siguen
// en una columna de 4xl) no. Sin esto, cargar `Todo` saltaba de 5 a 8 columnas.
export function SkeletonCoverGrid({
  count = 10,
  cols = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
}: {
  count?: number;
  cols?: string;
}) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <SkeletonCover />
          <SkeletonLine className="w-3/4" />
        </div>
      ))}
    </div>
  );
}

