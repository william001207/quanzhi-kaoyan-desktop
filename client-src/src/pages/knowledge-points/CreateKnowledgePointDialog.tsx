import { useEffect, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  Chapter,
  KnowledgePoint,
  Subject,
  SyllabusMode,
} from '@shared/api.interface';
import { REQUIREMENT_LEVEL_LABEL } from '@shared/api.interface';
import { getAll as getAllSubjects } from '@/api/subjects';
import { getBySubject as getChaptersBySubject } from '@/api/chapters';
import { create as createKnowledgePoint } from '@/api/knowledge-points';

interface CardBlockDraft {
  title: string;
  content: string;
}

interface CreateKnowledgePointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 从列表当前筛选带入的科目，省一次选择 */
  defaultSubjectId?: string;
  onCreated?: (kp: KnowledgePoint) => void;
}

const REQUIREMENT_OPTIONS: Array<keyof typeof REQUIREMENT_LEVEL_LABEL> = [
  'master',
  'familiar',
  'understand',
  'unmarked',
];

/** 章节来源：考试大纲 / 教材，两套章节树互不相通，必须显式选择 */
const SOURCE_OPTIONS: Array<{ value: SyllabusMode; label: string }> = [
  { value: 'exam_syllabus', label: '考试大纲' },
  { value: 'textbook', label: '教材' },
];

const emptyBlock = (): CardBlockDraft => ({ title: '', content: '' });

const CreateKnowledgePointDialog: React.FC<CreateKnowledgePointDialogProps> = ({
  open,
  onOpenChange,
  defaultSubjectId,
  onCreated,
}) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [subjectId, setSubjectId] = useState('');
  const [chapterSource, setChapterSource] = useState<SyllabusMode>('exam_syllabus');
  const [chapterId, setChapterId] = useState('');

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [requirementLevel, setRequirementLevel] = useState<string>('unmarked');
  const [importanceScore, setImportanceScore] = useState<string>('50');
  const [blocks, setBlocks] = useState<CardBlockDraft[]>([emptyBlock()]);
  const [flowStepsText, setFlowStepsText] = useState('');

  // 打开时重置表单（科目按调用方带入）
  useEffect(() => {
    if (!open) return;
    setSubjectId(defaultSubjectId || '');
    setChapterSource('exam_syllabus');
    setChapterId('');
    setTitle('');
    setSummary('');
    setRequirementLevel('unmarked');
    setImportanceScore('50');
    setBlocks([emptyBlock()]);
    setFlowStepsText('');
  }, [open, defaultSubjectId]);

  // 科目列表
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAllSubjects()
      .then((data) => {
        if (!cancelled) setSubjects(data);
      })
      .catch((err) => {
        logger.error('加载科目失败', err);
        toast.error('加载科目列表失败');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 章节列表：随科目和来源变化
  useEffect(() => {
    if (!open || !subjectId) {
      setChapters([]);
      return;
    }
    let cancelled = false;
    setChaptersLoading(true);
    getChaptersBySubject(subjectId, chapterSource)
      .then((data) => {
        if (!cancelled) setChapters(data ?? []);
      })
      .catch((err) => {
        logger.error('加载章节失败', err);
        if (!cancelled) {
          setChapters([]);
          toast.error('加载章节失败');
        }
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, subjectId, chapterSource]);

  const updateBlock = (index: number, patch: Partial<CardBlockDraft>) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
  };

  const handleSubmit = async () => {
    if (!subjectId) {
      toast.error('请先选择科目');
      return;
    }
    if (!chapterId) {
      toast.error('请选择所属章节');
      return;
    }
    if (!title.trim()) {
      toast.error('请填写知识点标题');
      return;
    }

    const validBlocks = blocks
      .map((b) => ({ title: b.title.trim(), content: b.content.trim() }))
      .filter((b) => b.title || b.content);

    const flowSteps = flowStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const cardData: Record<string, unknown> = {};
    if (summary.trim()) cardData.summary = summary.trim();
    if (validBlocks.length > 0) cardData.blocks = validBlocks;
    if (flowSteps.length > 0) cardData.flowSteps = flowSteps;

    setSubmitting(true);
    try {
      const created = await createKnowledgePoint({
        subjectId,
        chapterId,
        title: title.trim(),
        requirementLevel,
        importanceScore: Number(importanceScore) || 0,
        cardData: Object.keys(cardData).length > 0 ? cardData : undefined,
      });
      toast.success(`知识点「${created.title}」已添加`);
      onCreated?.(created);
      onOpenChange(false);
    } catch (err: unknown) {
      logger.error('新增知识点失败', err);
      // 平台错误包装为 { error: { message } }，Nest 原生为 { message }，校验失败是 string[]
      const data = (err as { response?: { data?: any } })?.response?.data;
      const raw = data?.error?.message ?? data?.message;
      const message = Array.isArray(raw) ? raw.join('；') : raw;
      toast.error(typeof message === 'string' && message ? message : '新增知识点失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增知识点</DialogTitle>
          <DialogDescription>
            知识点必须挂在某个科目下的某个章节里；带 * 的为必填。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 科目 / 来源 / 章节 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">科目 *</label>
              <Select
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setChapterId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择科目" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">章节来源</label>
              <Select
                value={chapterSource}
                onValueChange={(v) => {
                  setChapterSource(v as SyllabusMode);
                  setChapterId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">章节 *</label>
              <Select
                value={chapterId}
                onValueChange={setChapterId}
                disabled={!subjectId || chaptersLoading || chapters.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !subjectId
                        ? '先选科目'
                        : chaptersLoading
                          ? '加载中…'
                          : chapters.length === 0
                            ? '该来源下无章节'
                            : '选择章节'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span
                        style={{
                          paddingLeft: `${Math.max(0, (c.level ?? 1) - 1) * 12}px`,
                        }}
                      >
                        {c.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 标题 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">标题 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：球间牙本质"
              maxLength={500}
            />
          </div>

          {/* 要求等级 / 重要度 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">掌握要求</label>
              <Select value={requirementLevel} onValueChange={setRequirementLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUIREMENT_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {REQUIREMENT_LEVEL_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">重要度（0–100）</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={importanceScore}
                onChange={(e) => setImportanceScore(e.target.value)}
              />
            </div>
          </div>

          {/* 摘要 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">摘要</label>
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="一句话概括，会显示在卡片摘要区"
            />
          </div>

          {/* 卡片区块 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">卡片区块</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBlocks((prev) => [...prev, emptyBlock()])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                添加区块
              </Button>
            </div>
            {blocks.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无区块，可点右侧添加</p>
            )}
            <div className="space-y-2">
              {blocks.map((block, index) => (
                <div
                  key={index}
                  className="rounded-lg border p-2.5 space-y-2 bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={block.title}
                      onChange={(e) => updateBlock(index, { title: e.target.value })}
                      placeholder={`区块 ${index + 1} 标题，如：定义 / 机制 / 易错点`}
                      className="h-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        setBlocks((prev) => prev.filter((_, i) => i !== index))
                      }
                      aria-label="删除区块"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={block.content}
                    onChange={(e) => updateBlock(index, { content: e.target.value })}
                    placeholder="区块内容"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 流程步骤 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">流程步骤</label>
            <Textarea
              value={flowStepsText}
              onChange={(e) => setFlowStepsText(e.target.value)}
              placeholder="一行一步，如：&#10;取模&#10;灌注模型&#10;上𬌗架"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateKnowledgePointDialog;
