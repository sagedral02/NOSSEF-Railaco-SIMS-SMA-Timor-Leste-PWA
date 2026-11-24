'use client';

import { Select } from '@/components/ui';
import { useI18n } from '@/i18n';

import { useSelectedYear } from './api';

export function YearSelect() {
  const { t, tx } = useI18n();
  const { year, years, setYear } = useSelectedYear();
  if (!years.length) return null;
  return (
    <Select aria-label={t('common.year')} className="h-9 w-auto min-w-44" value={year?.id ?? ''} onChange={(e) => setYear(e.target.value)}>
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {t('common.year')} {y.name} · {tx(`status.${y.status}`, y.status)}
        </option>
      ))}
    </Select>
  );
}
