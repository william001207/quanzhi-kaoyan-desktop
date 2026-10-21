import React from 'react';
import type { KnowledgePointChapterPaths } from '@shared/api.interface';

interface ChapterPathBadgesProps {
  chapterPaths?: KnowledgePointChapterPaths;
  size?: 'xs' | 'sm';
  className?: string;
}

const ChapterPathBadges: React.FC<ChapterPathBadgesProps> = ({
  chapterPaths,
  size = 'xs',
  className = '',
}) => {
  if (!chapterPaths) return null;
  const hasExam = chapterPaths.examSyllabus?.length > 0;
  const hasTextbook = chapterPaths.textbook?.length > 0;
  if (!hasExam && !hasTextbook) return null;

  const sizeClass = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[10px] px-1.5 py-px';

  const examLast = hasExam
    ? chapterPaths.examSyllabus[chapterPaths.examSyllabus.length - 1]
    : null;
  const tbLast = hasTextbook
    ? chapterPaths.textbook[chapterPaths.textbook.length - 1]
    : null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {examLast && (
        <span
          className={`rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium ${sizeClass}`}
          title={`考纲·${examLast.title}`}
        >
          考纲·{examLast.title}
        </span>
      )}
      {tbLast && (
        <span
          className={`rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium ${sizeClass}`}
          title={`教材·${tbLast.title}`}
        >
          教材·{tbLast.title}
        </span>
      )}
    </div>
  );
};

export default ChapterPathBadges;
