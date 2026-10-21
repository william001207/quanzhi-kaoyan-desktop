import React, { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import type { Subject, Chapter, KnowledgePoint, KnowledgePointStatus, SyllabusMode, RequirementLevel } from '@shared/api.interface';
import {
  KP_STATUS_LABEL,
  REQUIREMENT_LEVEL_LABEL,
} from '@shared/api.interface';
import { ChevronRight, ChevronDown, BookOpen, BookMarked, FileText, ChevronLeft, ListTree, Plus, Pencil, ChevronUp, Trash2 } from 'lucide-react';
import { masteryColor, requirementBorderClass, isOverdue, formatDate, statusBadgeClass } from '@/utils/mastery';
import { cn } from '@/lib/utils';
import { showConfirm } from '@lark-apaas/client-toolkit';

const SYLLABUS_MODE_KEY = 'syllabus_mode';
const KP_PAGE_SIZE = 50;
const MOBILE_MOBILE_BREAKPOINT = 768;

function flattenTree(nodes: any[]): Chapter[] {
  const result: Chapter[] = [];
  const walk = (nodeList: any[]) => {
    for (const node of nodeList) {
      const { children, ...rest } = node;
      result.push(rest as Chapter);
      if (children && children.length > 0) {
        walk(children);
      }
    }
  };
  walk(nodes);
  return result;
}

interface ChapterTreeNodeProps {
  chapter: Chapter;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  kpCount: number;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
  children?: React.ReactNode;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (title: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  isAddingChild: boolean;
  addingTitle: string;
  onAddingTitleChange: (title: string) => void;
  onSaveAdd: () => void;
  onCancelAdd: () => void;
  onStartEdit: (id: string, title: string) => void;
  onStartAddChild: (parentId: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
}

const ChapterTreeNode = memo(function ChapterTreeNode({
  chapter,
  depth,
  isExpanded,
  isSelected,
  kpCount,
  onToggle,
  onClick,
  children,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onSaveEdit,
  onCancelEdit,
  isAddingChild,
  addingTitle,
  onAddingTitleChange,
  onSaveAdd,
  onCancelAdd,
  onStartEdit,
  onStartAddChild,
  onMoveUp,
  onMoveDown,
  onDelete,
}: ChapterTreeNodeProps) {
  const editSubmittedRef = useRef(false);
  const addSubmittedRef = useRef(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
      editSubmittedRef.current = false;
    }
  }, [isEditing]);

  useEffect(() => {
    if (isAddingChild && addInputRef.current) {
      addInputRef.current.focus();
      addSubmittedRef.current = false;
    }
  }, [isAddingChild]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(chapter.id);
    },
    [chapter.id, onToggle],
  );

  const handleClick = useCallback(() => {
    onClick(chapter.id);
  }, [chapter.id, onClick]);

  const handleAddChildClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStartAddChild(chapter.id);
    },
    [chapter.id, onStartAddChild],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStartEdit(chapter.id, chapter.title);
    },
    [chapter.id, chapter.title, onStartEdit],
  );

  const handleMoveUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveUp(chapter.id);
    },
    [chapter.id, onMoveUp],
  );

  const handleMoveDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveDown(chapter.id);
    },
    [chapter.id, onMoveDown],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(chapter.id);
    },
    [chapter.id, onDelete],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (editSubmittedRef.current) return;
        editSubmittedRef.current = true;
        onSaveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEdit();
      }
    },
    [onSaveEdit, onCancelEdit],
  );

  const handleEditBlur = useCallback(() => {
    if (editSubmittedRef.current) return;
    editSubmittedRef.current = true;
    onSaveEdit();
  }, [onSaveEdit]);

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (addSubmittedRef.current) return;
        addSubmittedRef.current = true;
        onSaveAdd();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancelAdd();
      }
    },
    [onSaveAdd, onCancelAdd],
  );

  const handleAddBlur = useCallback(() => {
    if (addSubmittedRef.current) return;
    addSubmittedRef.current = true;
    onSaveAdd();
  }, [onSaveAdd]);

  return (
    <div>
      <div
        className={`group relative flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {children ? (
          <button
            onClick={handleToggle}
            className="flex-shrink-0 p-0.5 -ml-0.5"
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {isEditing ? (
          <Input
            ref={editInputRef}
            value={editingTitle}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
            className="h-6 text-xs flex-1 px-2 py-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1 min-w-0">{chapter.title}</span>
        )}
        {!isEditing && kpCount > 0 && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {kpCount}
          </span>
        )}
        {/* 操作用绝对定位浮在右侧：opacity-0 只透明、仍占位，会把章节名挤掉约 52px */}
        {!isEditing && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded bg-background/95 px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleAddChildClick}
              aria-label="添加子章节"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleEditClick}
              aria-label="编辑章节"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleMoveUp}
              aria-label="上移"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleMoveDown}
              aria-label="下移"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={handleDelete}
              aria-label="删除章节"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {isExpanded && (
        <div>
          {isAddingChild && (
            <div
              className="flex items-center gap-1 px-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <span className="w-4 flex-shrink-0" />
              <Input
                ref={addInputRef}
                value={addingTitle}
                onChange={(e) => onAddingTitleChange(e.target.value)}
                onKeyDown={handleAddKeyDown}
                onBlur={handleAddBlur}
                placeholder="输入子章节标题"
                className="h-6 text-xs flex-1 px-2 py-0"
              />
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
});

interface KpTableRowProps {
  kp: KnowledgePoint;
  onClick: (id: string) => void;
  onUpdate?: (updatedKp: KnowledgePoint) => void;
}

const KpTableRow = memo(function KpTableRow({ kp, onClick, onUpdate }: KpTableRowProps) {
  const overdue = isOverdue(kp.nextReviewAt);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localLevel, setLocalLevel] = useState<RequirementLevel>(kp.requirementLevel);
  const selectCellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalLevel(kp.requirementLevel);
  }, [kp.requirementLevel]);

  const handleClick = useCallback(() => {
    onClick(kp.id);
  }, [kp.id, onClick]);

  const handleLabelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaving) return;
    setLocalLevel(kp.requirementLevel);
    setIsEditing(true);
  }, [kp.requirementLevel, isSaving]);

  const handleLevelChange = useCallback(async (value: string) => {
    const newLevel = value as RequirementLevel;
    if (newLevel === kp.requirementLevel) {
      setIsEditing(false);
      return;
    }
    const previousLevel = kp.requirementLevel;
    setLocalLevel(newLevel);
    setIsSaving(true);
    try {
      const updated = await api.knowledgePoints.update(kp.id, {
        requirementLevel: newLevel,
      });
      onUpdate?.(updated);
      toast.success('重要性已更新');
      setIsEditing(false);
    } catch (err) {
      logger.error('更新重要性失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '更新重要性失败';
      toast.error(msg);
      setLocalLevel(previousLevel);
    } finally {
      setIsSaving(false);
    }
  }, [kp.id, kp.requirementLevel, onUpdate]);

  const handleSelectOpenChange = useCallback((open: boolean) => {
    if (!open && !isSaving) {
      setIsEditing(false);
    }
  }, [isSaving]);

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/30"
      onClick={handleClick}
    >
      <TableCell className="font-medium align-top">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{kp.title}</span>
            {kp.examFrequency >= 3 && (
              <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                高频
              </span>
            )}
          </div>
          <ChapterPathBadges chapterPaths={kp.chapterPaths} size="xs" />
        </div>
      </TableCell>
      <TableCell className="align-top">
        {isEditing ? (
          <div ref={selectCellRef} className="inline-block w-16">
            <Select
              value={localLevel}
              onValueChange={handleLevelChange}
              onOpenChange={handleSelectOpenChange}
              disabled={isSaving}
            >
              <SelectTrigger
                className="h-6 text-[11px] px-1.5 py-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REQUIREMENT_LEVEL_LABEL) as RequirementLevel[]).map((level) => (
                  <SelectItem key={level} value={level}>
                    {REQUIREMENT_LEVEL_LABEL[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${requirementBorderClass(kp.requirementLevel)}`}
            onClick={handleLabelClick}
            title="点击修改"
          >
            {REQUIREMENT_LEVEL_LABEL[kp.requirementLevel]}
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm align-top">
        <div>{kp.examFrequency}</div>
        {kp.examSources && kp.examSources.length > 0 && (
          <div
            className="text-[10px] text-sky-600 mt-0.5 leading-tight truncate max-w-[10rem]"
            title={kp.examSources.join('、')}
          >
            {kp.examSources.slice(0, 2).join('、')}
            {kp.examSources.length > 2 &&
              ` +${kp.examSources.length - 2}`}
          </div>
        )}
        {kp.latestExamYear && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            最近 {kp.latestExamYear}
          </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-2">
          <div className="w-20">
            <div className={`h-1.5 rounded-full bg-muted overflow-hidden`}>
              <div
                className={`h-full rounded-full ${masteryColor(kp.masteryScore)}`}
                style={{ width: `${kp.masteryScore}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-medium w-8">
            {kp.masteryScore}%
          </span>
        </div>
      </TableCell>
      <TableCell
        className={`text-xs align-top ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
      >
        {kp.nextReviewAt
          ? formatDate(kp.nextReviewAt) + (overdue ? '（逾期）' : '')
          : '未安排'}
      </TableCell>
      <TableCell className="align-top">
        <div
          className={cn(
            'px-2 py-1 rounded text-[11px] border',
            statusBadgeClass(kp.status),
          )}
        >
          {KP_STATUS_LABEL[kp.status]}
        </div>
      </TableCell>
    </TableRow>
  );
});

const SyllabusPage: React.FC = () => {
  const navigate = useNavigate();

  const [syllabusMode, setSyllabusMode] = useState<SyllabusMode>(() => {
    if (typeof window === 'undefined') return 'exam_syllabus';
    const saved = localStorage.getItem(SYLLABUS_MODE_KEY) as SyllabusMode | null;
    return saved === 'textbook' ? 'textbook' : 'exam_syllabus';
  });
  const [mobileView, setMobileView] = useState<'tree' | 'list'>('tree');

  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(
    new Set(),
  );
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // null: 不在添加状态; '': 添加根级章节; '<id>': 在某章节下添加子章节
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [addingTitle, setAddingTitle] = useState('');
  const rootAddSubmittedRef = useRef(false);

  const [kpLoading, setKpLoading] = useState(false);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [kpTotal, setKpTotal] = useState(0);
  const [kpPage, setKpPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('importance');

  const topLevelChapters = useMemo(() => {
    if (syllabusMode === 'textbook') {
      const rootNodes = chapters.filter((c) => c.parentChapterId === null);
      const currentSubject = subjects.find((s) => s.id === activeSubjectId);
      if (rootNodes.length === 1 && currentSubject && rootNodes[0].title === currentSubject.name) {
        return chapters.filter((c) => c.parentChapterId === rootNodes[0].id);
      }
    }
    return chapters.filter((c) => c.parentChapterId === null);
  }, [chapters, syllabusMode, subjects, activeSubjectId]);

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, Chapter[]>();
    for (const c of chapters) {
      const key = c.parentChapterId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [chapters]);

  const kpCountMap = useMemo(() => {
    const directCount = new Map<string, number>();
    for (const kp of knowledgePoints) {
      const cur = directCount.get(kp.chapterId) ?? 0;
      directCount.set(kp.chapterId, cur + 1);
    }
    const totalCount = new Map<string, number>();
    const compute = (chapterId: string): number => {
      if (totalCount.has(chapterId)) return totalCount.get(chapterId)!;
      let total = directCount.get(chapterId) ?? 0;
      const children = childrenMap.get(chapterId) ?? [];
      for (const child of children) {
        total += compute(child.id);
      }
      totalCount.set(chapterId, total);
      return total;
    };
    for (const c of chapters) {
      compute(c.id);
    }
    return totalCount;
  }, [knowledgePoints, chapters, childrenMap]);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.subjects.getAll();
        setSubjects(result);
        if (result.length > 0) {
          setActiveSubjectId(result[0].id);
        }
      } catch (err) {
        logger.error('加载科目失败', err);
        toast.error('加载科目失败');
      } finally {
        setSubjectsLoading(false);
      }
    };
    load();
  }, []);

  const handleModeChange = useCallback((mode: SyllabusMode) => {
    setSyllabusMode(mode);
    try {
      localStorage.setItem(SYLLABUS_MODE_KEY, mode);
    } catch {
      // ignore
    }
    setSelectedChapterId(null);
    setExpandedChapters(new Set());
    setExpandedSubjects(new Set());
    setKpPage(1);
  }, []);

  useEffect(() => {
    if (!activeSubjectId) return;
    setChaptersLoading(true);
    setSelectedChapterId(null);

    const loadChapters = async () => {
      try {
        const result = await api.chapters.getTree(activeSubjectId, syllabusMode);
        setChapters(flattenTree(result));
      } catch (err) {
        logger.error('加载章节失败', err);
        toast.error('加载章节失败');
      } finally {
        setChaptersLoading(false);
      }
    };

    loadChapters();
  }, [activeSubjectId, syllabusMode, treeRefreshKey]);

  const getAncestorChain = useCallback((chapterId: string): string[] => {
    const chain: string[] = [];
    const parentMap = new Map<string, string | null>();
    for (const c of chapters) {
      parentMap.set(c.id, c.parentChapterId ?? null);
    }
    let current: string | null = chapterId;
    while (current) {
      const parent = parentMap.get(current);
      if (parent !== null && parent !== undefined) {
        chain.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return chain;
  }, [chapters]);

  useEffect(() => {
    if (!selectedChapterId || chapters.length === 0) return;
    const ancestors = getAncestorChain(selectedChapterId);
    if (ancestors.length > 0) {
      setExpandedChapters((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ancestors) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    const topLevelParent = ancestors[ancestors.length - 1] ?? selectedChapterId;
    const topChapter = chapters.find((c) => c.id === topLevelParent);
    const subjectForChapter = subjects.find(
      (s) => s.id === topChapter?.subjectId,
    );
    if (subjectForChapter) {
      setExpandedSubjects((prev) => {
        if (prev.has(subjectForChapter.id)) return prev;
        const next = new Set(prev);
        next.add(subjectForChapter.id);
        return next;
      });
    }
  }, [selectedChapterId, chapters, subjects, getAncestorChain]);

  useEffect(() => {
    if (!activeSubjectId) return;
    setKpLoading(true);

    const loadKp = async () => {
      try {
        const result = await api.knowledgePoints.list({
          subjectId: activeSubjectId,
          chapterId: selectedChapterId || undefined,
          status: statusFilter || undefined,
          source: syllabusMode,
          page: kpPage,
          pageSize: KP_PAGE_SIZE,
        });
        setKnowledgePoints(result.items);
        setKpTotal(result.total);
      } catch (err) {
        logger.error('加载知识点失败', err);
        toast.error('加载知识点失败');
      } finally {
        setKpLoading(false);
      }
    };

    loadKp();
  }, [activeSubjectId, selectedChapterId, statusFilter, syllabusMode, kpPage]);

  const sortedPoints = useMemo(() => {
    const list = [...knowledgePoints];
    switch (sortBy) {
      case 'mastery_asc':
        return list.sort((a, b) => a.masteryScore - b.masteryScore);
      case 'mastery_desc':
        return list.sort((a, b) => b.masteryScore - a.masteryScore);
      case 'exam_freq':
        return list.sort((a, b) => b.examFrequency - a.examFrequency);
      case 'importance':
      default:
        return list.sort((a, b) => b.importanceScore - a.importanceScore);
    }
  }, [knowledgePoints, sortBy]);

  const toggleSubject = useCallback((id: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSubjectClick = useCallback((id: string) => {
    setActiveSubjectId(id);
    setExpandedSubjects((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSelectedChapterId(null);
    setKpPage(1);
  }, []);

  const toggleChapter = useCallback((id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleChapterClick = useCallback((id: string) => {
    setSelectedChapterId((prev) => (prev === id ? null : id));
    setKpPage(1);
    setMobileView('list');
  }, []);

  const handleKpRowClick = useCallback(
    (id: string) => {
      navigate(`/knowledge-points/${id}`);
    },
    [navigate],
  );

  const handleKpUpdate = useCallback((updatedKp: KnowledgePoint) => {
    setKnowledgePoints((prev) =>
      prev.map((kp) => (kp.id === updatedKp.id ? updatedKp : kp)),
    );
  }, []);

  const refreshTree = useCallback(() => {
    setTreeRefreshKey((k) => k + 1);
  }, []);

  const handleStartEdit = useCallback((id: string, title: string) => {
    setEditingChapterId(id);
    setEditingTitle(title);
    setAddingParentId(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingChapterId(null);
    setEditingTitle('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingChapterId) return;
    const title = editingTitle.trim();
    if (!title) {
      handleCancelEdit();
      return;
    }
    try {
      await api.chapters.updateChapter(editingChapterId, { title });
      toast.success('章节已更新');
      setEditingChapterId(null);
      setEditingTitle('');
      refreshTree();
    } catch (err) {
      logger.error('更新章节失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '更新章节失败';
      toast.error(msg);
    }
  }, [editingChapterId, editingTitle, refreshTree, handleCancelEdit]);

  const handleStartAddChild = useCallback((parentId: string) => {
    setAddingParentId(parentId);
    setAddingTitle('');
    setEditingChapterId(null);
    setExpandedChapters((prev) => {
      if (prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
  }, []);

  const handleStartAddRoot = useCallback(() => {
    setAddingParentId('');
    setAddingTitle('');
    setEditingChapterId(null);
    rootAddSubmittedRef.current = false;
  }, []);

  const handleCancelAdd = useCallback(() => {
    setAddingParentId(null);
    setAddingTitle('');
  }, []);

  const handleSaveAdd = useCallback(async () => {
    if (addingParentId === null || !activeSubjectId) return;
    const title = addingTitle.trim();
    if (!title) {
      handleCancelAdd();
      return;
    }
    try {
      await api.chapters.createChapter({
        title,
        subjectId: activeSubjectId,
        parentChapterId: addingParentId === '' ? undefined : addingParentId,
        source: syllabusMode,
      });
      toast.success('章节已创建');
      setAddingParentId(null);
      setAddingTitle('');
      refreshTree();
    } catch (err) {
      logger.error('创建章节失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '创建章节失败';
      toast.error(msg);
    }
  }, [addingParentId, addingTitle, activeSubjectId, syllabusMode, refreshTree, handleCancelAdd]);

  const handleMoveUp = useCallback(async (id: string) => {
    try {
      await api.chapters.moveChapter(id, 'up');
      refreshTree();
    } catch (err) {
      logger.error('上移章节失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '上移失败';
      toast.error(msg);
    }
  }, [refreshTree]);

  const handleMoveDown = useCallback(async (id: string) => {
    try {
      await api.chapters.moveChapter(id, 'down');
      refreshTree();
    } catch (err) {
      logger.error('下移章节失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '下移失败';
      toast.error(msg);
    }
  }, [refreshTree]);

  const handleDeleteChapter = useCallback(async (id: string) => {
    if (!await showConfirm('确定要删除该章节吗？')) return;
    try {
      await api.chapters.deleteChapter(id);
      toast.success('章节已删除');
      if (selectedChapterId === id) {
        setSelectedChapterId(null);
      }
      refreshTree();
    } catch (err) {
      logger.error('删除章节失败', err);
      const msg = (err as any)?.response?.data?.error?.message || '删除章节失败';
      toast.error(msg);
    }
  }, [selectedChapterId, refreshTree]);

  const handleRootAddKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (rootAddSubmittedRef.current) return;
        rootAddSubmittedRef.current = true;
        handleSaveAdd();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelAdd();
      }
    },
    [handleSaveAdd, handleCancelAdd],
  );

  const handleRootAddBlur = useCallback(() => {
    if (rootAddSubmittedRef.current) return;
    rootAddSubmittedRef.current = true;
    handleSaveAdd();
  }, [handleSaveAdd]);

  const renderChapterTree = useCallback(
    (nodes: Chapter[], depth: number): React.ReactNode => {
      return nodes.map((chapter) => {
        const children = childrenMap.get(chapter.id) ?? [];
        const isExpanded = expandedChapters.has(chapter.id);
        const isSelected = selectedChapterId === chapter.id;
        const kpCount = kpCountMap.get(chapter.id) ?? 0;
        const isEditing = editingChapterId === chapter.id;
        const isAddingChild = addingParentId === chapter.id;
        return (
          <ChapterTreeNode
            key={chapter.id}
            chapter={chapter}
            depth={depth}
            isExpanded={isExpanded}
            isSelected={isSelected}
            kpCount={kpCount}
            onToggle={toggleChapter}
            onClick={handleChapterClick}
            isEditing={isEditing}
            editingTitle={editingTitle}
            onEditingTitleChange={setEditingTitle}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            isAddingChild={isAddingChild}
            addingTitle={addingTitle}
            onAddingTitleChange={setAddingTitle}
            onSaveAdd={handleSaveAdd}
            onCancelAdd={handleCancelAdd}
            onStartEdit={handleStartEdit}
            onStartAddChild={handleStartAddChild}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onDelete={handleDeleteChapter}
          >
            {children.length > 0 && (
              <div>{renderChapterTree(children, depth + 1)}</div>
            )}
          </ChapterTreeNode>
        );
      });
    },
    [
      childrenMap,
      expandedChapters,
      selectedChapterId,
      kpCountMap,
      toggleChapter,
      handleChapterClick,
      editingChapterId,
      editingTitle,
      handleSaveEdit,
      handleCancelEdit,
      addingParentId,
      addingTitle,
      handleSaveAdd,
      handleCancelAdd,
      handleStartEdit,
      handleStartAddChild,
      handleMoveUp,
      handleMoveDown,
      handleDeleteChapter,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(kpTotal / KP_PAGE_SIZE));

  return (
    <div className="p-3 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">大纲地图</h1>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
          <button
            className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              syllabusMode === 'exam_syllabus'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleModeChange('exam_syllabus')}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">真题大纲</span>
            <span className="sm:hidden">考纲</span>
          </button>
          <button
            className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              syllabusMode === 'textbook'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleModeChange('textbook')}
          >
            <BookMarked className="h-4 w-4" />
            <span className="hidden sm:inline">本科教材目录</span>
            <span className="sm:hidden">教材</span>
          </button>
        </div>
      </div>

      {/* 移动端视图切换 Tab */}
      <div className="md:hidden mb-3 inline-flex rounded-md border bg-muted/40 p-0.5 w-full">
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            mobileView === 'tree'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMobileView('tree')}
        >
          <ListTree className="h-4 w-4" />
          章节
        </button>
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            mobileView === 'list'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMobileView('list')}
        >
          <ChevronRight className="h-4 w-4" />
          知识点
          {selectedChapterId && (
            <span className="bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">1</span>
          )}
        </button>
      </div>

      <div className="flex gap-4 flex-col md:flex-row md:h-[calc(100vh-165px)]">
        {/* 左侧：科目 + 章节树（桌面端常驻，移动端仅在tree视图显示） */}
        <Card className={`w-full md:w-[22rem] md:flex-shrink-0 ${mobileView === 'list' ? 'hidden md:block' : ''} md:overflow-hidden md:flex md:flex-col`}>
          <CardContent className="p-0 h-full overflow-auto">
            {subjectsLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : subjects.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                暂无科目
              </div>
            ) : (
              <div className="p-2">
                 {subjects.map((subject) => {
                   const isExpanded = expandedSubjects.has(subject.id);
                   const isActive = activeSubjectId === subject.id;
                   const hasChapters = subject.totalKnowledgePoints > 0;
                   return (
                     <div key={subject.id} className="mb-1">
                       <div
                         className={`flex items-center gap-1 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                           isActive
                             ? 'bg-primary/10 text-primary font-medium'
                             : 'hover:bg-muted/50'
                         }`}
                         onClick={() => handleSubjectClick(subject.id)}
                       >
                         {hasChapters ? (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               toggleSubject(subject.id);
                             }}
                             className="flex-shrink-0 p-0.5 -ml-0.5"
                             aria-label={isExpanded ? '折叠科目' : '展开科目'}
                           >
                             {isExpanded ? (
                               <ChevronDown className="h-4 w-4 text-muted-foreground" />
                             ) : (
                               <ChevronRight className="h-4 w-4 text-muted-foreground" />
                             )}
                           </button>
                         ) : (
                           <span className="w-4 flex-shrink-0" />
                         )}
                         <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                         <span className="truncate flex-1 text-sm">{subject.name}</span>
                         <span className="text-[10px] text-muted-foreground flex-shrink-0">
                           {subject.totalKnowledgePoints}
                         </span>
                       </div>
                       {isExpanded && !chaptersLoading && (
                         <div className="mt-1 space-y-0.5">
                           {topLevelChapters.length === 0 ? (
                             <div className="text-xs text-muted-foreground px-3 py-2">
                               {syllabusMode === 'textbook' ? '教材目录整理中' : '暂无章节'}
                             </div>
                            ) : (
                              renderChapterTree(topLevelChapters, 1)
                            )}
                            {addingParentId === '' && (
                              <div
                                className="flex items-center gap-1 px-2 py-1"
                                style={{ paddingLeft: '20px' }}
                              >
                                <span className="w-4 flex-shrink-0" />
                                <Input
                                  value={addingTitle}
                                  onChange={(e) => setAddingTitle(e.target.value)}
                                  onKeyDown={handleRootAddKeyDown}
                                  onBlur={handleRootAddBlur}
                                  placeholder="输入章节标题"
                                  className="h-6 text-xs flex-1 px-2 py-0"
                                  autoFocus
                                />
                              </div>
                            )}
                            <button
                              className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 rounded mt-0.5"
                              style={{ paddingLeft: '20px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartAddRoot();
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              添加章
                            </button>
                          </div>
                        )}
                       {isExpanded && chaptersLoading && (
                         <div className="ml-4 mt-2 space-y-1">
                           {[...Array(5)].map((_, i) => (
                             <Skeleton key={i} className="h-6 w-40" />
                           ))}
                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
            )}
          </CardContent>
        </Card>

        {/* 右侧：知识点表格（桌面端常驻，移动端仅在list视图显示） */}
        <Card className={`flex-1 flex flex-col md:overflow-hidden ${mobileView === 'tree' ? 'hidden md:flex' : ''}`}>
          {/* 筛选栏 */}
          <div className="px-3 md:px-6 py-3 border-b flex items-center gap-2 md:gap-4 flex-wrap">
            <div className="text-xs md:text-sm text-muted-foreground">
              共 {kpTotal} 个知识点
              {selectedChapterId && '（当前章节筛选）'}
            </div>
            <div className="flex-1" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部状态</SelectItem>
                {Object.entries(KP_STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="importance">按重要性</SelectItem>
                <SelectItem value="exam_freq">按考频</SelectItem>
                <SelectItem value="mastery_asc">掌握度升序</SelectItem>
                <SelectItem value="mastery_desc">掌握度降序</SelectItem>
              </SelectContent>
            </Select>
            {selectedChapterId && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setSelectedChapterId(null)}
              >
                清除章节筛选
              </button>
            )}
          </div>

          <CardContent className="p-0 flex-1 overflow-auto">
             {kpLoading ? (
               <div className="p-4 space-y-2">
                 {[...Array(8)].map((_, i) => (
                   <Skeleton key={i} className="h-10 w-full" />
                 ))}
               </div>
             ) : sortedPoints.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2">
                 {syllabusMode === 'textbook' ? (
                   <>
                     <BookMarked className="h-10 w-10 text-muted-foreground/40 mb-2" />
                     <div className="font-medium">本科教材目录整理中</div>
                     <div className="text-xs">导入教材目录后，可按教材章节复习知识点</div>
                   </>
                 ) : (
                   <div>暂无知识点</div>
                 )}
               </div>
             ) : (
              <>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="min-w-[140px]">知识点</TableHead>
                      <TableHead className="w-24 min-w-[80px]">大纲要求</TableHead>
                      <TableHead className="w-20 min-w-[70px] whitespace-nowrap">真题次数</TableHead>
                      <TableHead className="w-36 min-w-[120px]">掌握度</TableHead>
                      <TableHead className="w-28 min-w-[90px] whitespace-nowrap">下次复习</TableHead>
                      <TableHead className="w-24 min-w-[70px]">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPoints.map((kp) => (
                      <KpTableRow
                        key={kp.id}
                        kp={kp}
                        onClick={handleKpRowClick}
                        onUpdate={handleKpUpdate}
                      />
                    ))}
                  </TableBody>
                </Table>
                </div>
                {kpTotal > KP_PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={kpPage <= 1}
                      onClick={() => setKpPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-3 w-3" />
                      上一页
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      第 {kpPage} / {totalPages} 页
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={kpPage >= totalPages}
                      onClick={() => setKpPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SyllabusPage;
