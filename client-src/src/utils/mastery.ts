import type { KnowledgePointStatus, QuestionStatus, RequirementLevel } from '@shared/api.interface';

export function masteryColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function masteryTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

export function statusBadgeVariant(status: KnowledgePointStatus | QuestionStatus): string {
  switch (status) {
    case 'mastered':
      return 'default';
    case 'familiar':
      return 'secondary';
    case 'medium':
      return 'outline';
    case 'weak':
      return 'destructive';
    case 'not_started':
      return 'outline';
    default:
      return 'secondary';
  }
}

export function statusBadgeClass(status: KnowledgePointStatus | QuestionStatus): string {
  switch (status) {
    case 'mastered':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'familiar':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'medium':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'weak':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'not_started':
      return 'bg-slate-50 text-slate-500 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

export function requirementBorderClass(level: RequirementLevel): string {
  switch (level) {
    case 'master':
      return 'border-red-300 text-red-600 bg-red-50';
    case 'familiar':
      return 'border-amber-300 text-amber-600 bg-amber-50';
    case 'understand':
      return 'border-slate-300 text-slate-500 bg-slate-50';
    default:
      return 'border-slate-200 text-slate-400';
  }
}

export function isOverdue(nextReviewAt: string | null): boolean {
  if (!nextReviewAt) return false;
  return new Date(nextReviewAt) < new Date();
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
