import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/app-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIconMark size={size.width} />, size);
}
