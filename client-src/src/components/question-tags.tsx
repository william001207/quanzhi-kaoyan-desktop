import { cn } from '@/lib/utils';

interface QuestionTagsProps {
  year?: number | null;
  source?: string | null;
  yearVariant?: 'normal' | 'muted';
  sourceVariant?: 'normal' | 'muted';
  className?: string;
}

export function QuestionTags({
  year,
  source,
  yearVariant = 'normal',
  sourceVariant = 'normal',
  className = '',
}: QuestionTagsProps) {
  const hasYear = year != null && year > 0;
  const hasSource = !!source;

  if (!hasYear && !hasSource) return null;

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {hasYear && (
        <span
          className={cn(
            'text-[11px] px-1.5 py-px rounded font-normal',
            yearVariant === 'muted'
              ? 'bg-slate-50 text-slate-400 border border-slate-100'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {year}
        </span>
      )}
      {hasSource && (
        <span
          className={cn(
            'text-[11px] px-1.5 py-px rounded font-normal border max-w-[140px] truncate',
            sourceVariant === 'muted'
              ? 'bg-sky-50/50 text-sky-500 border-sky-100/50'
              : 'bg-sky-50 text-sky-700 border-sky-100',
          )}
          title={source ?? undefined}
        >
          {source}
        </span>
      )}
    </div>
  );
}
