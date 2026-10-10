import type { ReactNode } from 'react';
import { RouteMessages } from '@/components/route-messages';
export default function ComparisonMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={['comparisons']}>{children}</RouteMessages>;
}
