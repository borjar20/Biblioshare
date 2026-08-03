import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/app-icon";

// Badge de notificación: el iconito monocromo de la barra de estado de Android.
// 96x96 = 24dp a densidad xxxhdpi, el tamaño que pide Chrome. Sin esta ruta,
// `showNotification` sin `badge` deja que Chrome ponga SU logo, no el nuestro.
const size = { width: 96, height: 96 };

export function GET() {
  return new ImageResponse(<AppIconMark size={size.width} monochrome />, size);
}
