import { DumbbellIcon, HeartIcon, BookIcon, NoteIcon, UsersIcon, SearchIcon } from "@/components/ui/icons";
import type { PetAttribute } from "@/lib/pet/classes";

/** Glifo y color de cada atributo, compartidos por Personaje y Misiones.
 *
 * El color pertenece al DATO, nunca al rol de un control (regla de la tinta
 * única de `DESIGN.md`): colorea la barra del atributo y el icono de la misión
 * que lo alimenta, y así la misma actividad se reconoce en las dos pantallas
 * sin leer el nombre. Los seis valores viven en `pet-game.module.css`. */
export const ATTR_ICON: Record<PetAttribute, typeof BookIcon> = {
  FUE: DumbbellIcon,
  CON: HeartIcon,
  INT: BookIcon,
  SAB: NoteIcon,
  CAR: UsersIcon,
  DES: SearchIcon,
};

export const ATTR_COLOR: Record<PetAttribute, string> = {
  FUE: "var(--attr-fue)",
  CON: "var(--attr-con)",
  INT: "var(--attr-int)",
  SAB: "var(--attr-sab)",
  CAR: "var(--attr-car)",
  DES: "var(--attr-des)",
};
