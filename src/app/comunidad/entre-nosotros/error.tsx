'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
export default function ComparisonError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('comparisons');
  return <div role="alert" className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-10"><h1 className="font-serif text-2xl font-semibold">{t('title')}</h1><p>{t('errors.load-failed')}</p><Button onClick={reset}>{t('retry')}</Button></div>;
}
