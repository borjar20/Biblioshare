"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  fetchNotifications,
  markAllNotificationsRead,
} from "@/lib/social/notification-actions";
import { type Notification } from "@/lib/social/notification-types";
import { notificationCopy } from "@/lib/social/notification-copy";
import { isEmojiSupported } from "@/lib/social/emoji-support";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "./user-avatar";
import { BellIcon } from "@/components/ui/icons";
import { PushToggle } from "@/components/push/push-toggle";

// Campana con contador de no leídas + dropdown (EPIC-05, Bloque D, SD-5). Al
// abrir, marca todo como leído (sin selección fila a fila, mismo espíritu
// simple que el resto de toggles de la app).
//
// La LISTA se pide al abrir, no al cargar la página: viajaba en cada render de
// cada ruta desde AppShell, que bloquea el primer byte (issue #283). Solo el
// contador llega con el chrome, porque es lo único que se ve sin abrir.
export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  // null = todavía no se ha pedido nunca (o está en vuelo la primera vez).
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    // El contador baja a 0 en cuanto se abre, sin esperar al servidor: es lo
    // que ve el usuario y la acción no puede fallar de forma interesante.
    const hadUnread = unreadCount > 0;
    if (hadUnread) setUnreadCount(0);

    // Se pide SIEMPRE al abrir (no solo la primera vez): entre una apertura y
    // otra pueden haber llegado notificaciones nuevas, y antes esto se
    // refrescaba solo porque la lista viajaba en cada render de página.
    const list = await fetchNotifications();
    setNotifications(list);

    // Marcar como leído va DESPUÉS de traer la lista, no en paralelo: son dos
    // peticiones distintas y si el update ganase la carrera, la lista llegaría
    // ya toda leída y ninguna fila enseñaría su punto de no leída.
    if (hadUnread) await markAllNotificationsRead();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={t("title")}
        onClick={() => void toggle()}
        className="relative inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface shadow-cover">
          <div className="border-b border-border px-4 py-2 font-serif text-sm font-semibold text-foreground">
            {t("title")}
          </div>
          {notifications === null ? (
            // Mismo alto que el estado vacío para que el desplegable no pegue
            // un salto al llegar la lista. Es un panel `absolute`, así que esto
            // no mueve la página, pero sí lo que el usuario está mirando.
            <div
              className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              aria-busy="true"
            >
              <BellIcon className="h-6 w-6 animate-pulse text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellIcon className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {notifications.map((n) => {
                // La MISMA función que usa el push. Con el comprobador de
                // emoji: aquí sí hay canvas, y un emoji que este sistema no
                // sabe pintar saldría como cuadradito (issue #793), así que se
                // cae a la copia sin emoji.
                const copy = notificationCopy({
                  type: n.type,
                  context: n.context,
                  name: n.actorDisplayName || n.actorUsername || tCommon("appName"),
                  extraActorsCount: n.extraActorsCount,
                  canRenderEmoji: isEmojiSupported,
                });
                const texto = t(copy.key, copy.values);

                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted"
                    >
                      {/* Un aviso del sistema (recordatorio de evento) no tiene
                          actor: en su hueco va un glifo de campana, no un avatar de
                          nadie. `name` cae a la marca para que la copy con {name}
                          siga teniendo algo, aunque las claves de los avisos del
                          sistema no lo usan. */}
                      {n.actorId ? (
                        <UserAvatar
                          name={n.actorDisplayName || n.actorUsername || ""}
                          avatarUrl={n.actorAvatarUrl}
                          size={32}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-accent"
                        >
                          <BellIcon className="h-4 w-4" />
                        </span>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* `break-words` + `line-clamp-2`: el texto ya no es
                            una frase fija y corta, puede traer un extracto de
                            hasta 140 grafemas escritos por otra persona
                            (`buildExcerpt`, que no parte tokens). Una URL
                            pegada sin puntos de corte desbordaría este panel
                            de `w-80` -- y sin el recorte de líneas, una
                            notificación larga empujaría a las demás fuera de
                            la vista. */}
                        <span className="line-clamp-2 break-words text-sm text-foreground">
                          {texto}
                        </span>
                        <TimeAgo
                          iso={n.createdAt}
                          className="font-mono text-[10px] text-muted-foreground"
                        />
                      </div>

                      {/* Punto de no leída. Se calcula sobre la lista que se trajo
                          al ABRIR, antes de marcar nada: abrir la campana marca
                          todo como leído, pero las que llegaron sin leer siguen
                          señaladas mientras el desplegable está abierto. */}
                      {!n.readAt && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border">
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  );
}
