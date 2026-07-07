import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/app-icon";

const size = { width: 192, height: 192 };

export function GET() {
  return new ImageResponse(<AppIconMark size={size.width} />, size);
}
