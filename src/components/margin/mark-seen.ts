import { markMarginSeen } from "@/lib/margin/actions";

// markMarginSeen rechaza más de 50 ids de golpe: se envían por tandas.
const CHUNK = 50;

export async function markSeenInChunks(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await markMarginSeen(ids.slice(i, i + CHUNK));
  }
}
