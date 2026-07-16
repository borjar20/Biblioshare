import Image from "next/image";
import Link from "next/link";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaMember } from "@/lib/sagas/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { sagaHref } from "@/lib/catalog/item-href";
import { EyeIcon } from "@/components/ui/icons";

// La tira de portadas de la saga PRINCIPAL (.saga-block del frame 1): la obra
// actual va anillada con el acento de su tipo y marcada con el ojo; las demás
// quedan como enlaces atenuados.
//
// Solo se pinta en móvil: en PC (frame 8) no hay tira y todas las sagas son
// filas — de eso se encarga SagaList.
export function SagaStrip({
  members,
  currentType,
  currentId,
  sagaId,
  sagaName,
  positionLabel,
}: {
  members: SagaMember[];
  currentType: ItemType;
  currentId: string;
  sagaId: string;
  sagaName: string;
  /** "· nº 1 de 3" ya traducido, o null si la obra no tiene posición. */
  positionLabel: string | null;
}) {
  if (members.length < 1) return null;
  const accent = MEDIA_ACCENT[currentType];

  return (
    <section className="flex flex-col gap-3.5">
      {/* .saga-name: el nombre de la saga y la posición de esta obra. El
          rótulo "Sagas · N" lo pone la sección de arriba, así que aquí ya no
          hace falta eyebrow. */}
      <div className="flex flex-wrap items-baseline gap-1.5">
        <Link
          href={sagaHref(sagaId)}
          className={`text-sm font-semibold ${accent.text} underline-offset-2 hover:underline`}
        >
          {sagaName}
        </Link>
        {positionLabel && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {positionLabel}
          </span>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {members.map((m) => {
          const isCurrent =
            m.itemType === currentType && m.itemId === currentId;
          const inner = (
            <>
              <div className="relative aspect-2/3 w-full overflow-hidden bg-surface-muted">
                {m.coverUrl ? (
                  <Image
                    src={m.coverUrl}
                    alt={m.title}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
                    {m.title}
                  </div>
                )}
                {isCurrent && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full ${accent.bg} text-accent-foreground`}
                  >
                    <EyeIcon className="h-3 w-3" />
                  </span>
                )}
                {m.position != null && (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    #{m.position}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-medium text-foreground">
                  {m.title}
                </p>
              </div>
            </>
          );

          const cardClass = `w-24 shrink-0 overflow-hidden rounded-lg border bg-surface ${
            isCurrent
              ? `${accent.border} ring-1 ${accent.ring}`
              : "border-border opacity-60 transition-opacity hover:opacity-100"
          }`;

          return isCurrent ? (
            <div key={`${m.itemType}:${m.itemId}`} className={cardClass}>
              {inner}
            </div>
          ) : (
            <Link
              key={`${m.itemType}:${m.itemId}`}
              href={m.href}
              className={cardClass}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
