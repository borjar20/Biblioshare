"use client";
import type { AtlasLayout, Lens, Orientation } from "@/lib/sagas/atlas/layout";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import type { SagaItemRole } from "@/lib/sagas/roles";
import type { AtlasLevel } from "./atlas-work";
import { BackdropOrden } from "./backdrop-orden";
import { BackdropPublicacion } from "./backdrop-publicacion";
import { BackdropRol } from "./backdrop-rol";

/** Fondo del plano, en coordenadas de mundo (el plano ya lleva la transformación).
 *  Reparte por lente: Orden (regiones, arcos, islas), Rol (carriles e hilos) y
 *  Publicación (eje de años e hilo de salida). */
export function AtlasBackdrop({ lens, orientation, layout, model, level, sagaName, authenticated, role, onIsland, onRole }: {
  lens: Lens;
  orientation: Orientation;
  layout: AtlasLayout;
  model: AtlasModel;
  level: AtlasLevel;
  sagaName: string;
  authenticated: boolean;
  role: SagaItemRole | null;
  onIsland: (island: { x: number; y: number }) => void;
  onRole: (role: SagaItemRole) => void;
}) {
  if (lens === "rol") return <BackdropRol layout={layout} orientation={orientation} role={role} onRole={onRole} />;
  if (lens === "publicacion") return <BackdropPublicacion layout={layout} orientation={orientation} />;
  return <BackdropOrden layout={layout} model={model} level={level} sagaName={sagaName} authenticated={authenticated} onIsland={onIsland} />;
}
