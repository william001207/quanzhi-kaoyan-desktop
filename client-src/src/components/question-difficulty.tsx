import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { cn } from '@/lib/utils';

interface QuestionDifficultyStarsProps {
  difficulty: number; // 1-5
  editable?: boolean;
  questionId?: string;
  size?: 'sm' | 'md' | 'lg';
  onUpdate?: (newDifficulty: number) => void;
}

export const QuestionDifficultyStars: React.FC<QuestionDifficultyStarsProps> = ({
  difficulty,
  editable = false,
  questionId,
  size = 'md',
  onUpdate,
}) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const displayValue = hoverValue ?? difficulty;

  const sizeMap = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleClick = async (value: number) => {
    if (!editable || !questionId || saving) return;
    if (value === difficulty) return;

    setSaving(true);
    try {
      await axiosForBackend.patch(`/api/exam-questions/${questionId}/difficulty`, {
        difficulty: value,
      });
      onUpdate?.(value);
    } catch (error) {
      logger.error('更新难度失败', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => handleClick(n)}
          onMouseEnter={() => editable && setHoverValue(n)}
          onMouseLeave={() => setHoverValue(null)}
          className={cn(
            'p-0.5 rounded transition-colors',
            editable ? 'cursor-pointer hover:scale-110' : 'cursor-default',
            editable && 'min-w-[20px] min-h-[20px] touch-manipulation'
          )}
          disabled={!editable}
          aria-label={`${n}星难度`}
        >
          <Star
            className={cn(
              sizeMap[size],
              n <= displayValue
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-slate-300'
            )}
          />
        </button>
      ))}
    </div>
  );
};
