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
import type {
  KnowledgePoint,
  KnowledgePointCardData,
} from '@shared/api.interface';
import { updateCardData } from '@/api/knowledge-points';

interface CardBlockDraft {
  title: string;
  subtitleEn: string;
  content: string;
}

interface EditKnowledgePointCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgePoint: KnowledgePoint | null;
  onSaved?: (kp: KnowledgePoint) => void;
}

const emptyBlock = (): CardBlockDraft => ({ title: '', subtitleEn: '', content: '' });

const EditKnowledgePointCardDialog: React.FC<EditKnowledgePointCardDialogProps> = ({
  open,
  onOpenChange,
  knowledgePoint,
  onSaved,
}) => {
  const [summary, setSummary] = useState('');
  const [blocks, setBlocks] = useState<CardBlockDraft[]>([]);
  const [flowStepsText, setFlowStepsText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 打开时用当前知识点卡片内容填充表单
  useEffect(() => {
    if (!open || !knowledgePoint) return;
    const cd: KnowledgePointCardData = knowledgePoint.cardData ?? {};
    setSummary(cd.summary ?? '');
    setBlocks(
      (cd.blocks ?? []).map((b) => ({
        title: b.title ?? '',
        subtitleEn: b.subtitleEn ?? '',
        content: b.content ?? '',
      })),
    );
    setFlowStepsText((cd.flowSteps ?? []).join('\n'));
  }, [open, knowledgePoint]);

  const updateBlock = (index: number, patch: Partial<CardBlockDraft>) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
  };

  const handleSubmit = async () => {
    if (!knowledgePoint) return;

    const validBlocks = blocks
      .map((b) => ({
        title: b.title.trim(),
        subtitleEn: b.subtitleEn.trim(),
        content: b.content.trim(),
      }))
      .filter((b) => b.title || b.content);

    const flowSteps = flowStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const cardData: KnowledgePointCardData = {};
    if (summary.trim()) cardData.summary = summary.trim();
    if (validBlocks.length > 0) {
      cardData.blocks = validBlocks.map((b) => {
        const block: { title: string; subtitleEn?: string; content: string } = {
          title: b.title,
          content: b.content,
        };
        if (b.subtitleEn) block.subtitleEn = b.subtitleEn;
        return block;
      });
    }
    if (flowSteps.length > 0) cardData.flowSteps = flowSteps;

    setSubmitting(true);
    try {
      const updated = await updateCardData(knowledgePoint.id, cardData);
      toast.success('卡片已保存');
      onSaved?.(updated);
      onOpenChange(false);
    } catch (err: unknown) {
      logger.error('保存卡片失败', err);
      const data = (err as { response?: { data?: any } })?.response?.data;
      const raw = data?.error?.message ?? data?.message;
      const message = Array.isArray(raw) ? raw.join('；') : raw;
      toast.error(typeof message === 'string' && message ? message : '保存卡片失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑知识卡片</DialogTitle>
          <DialogDescription>
            {knowledgePoint?.title
              ? `正在编辑「${knowledgePoint.title}」的知识卡片与思维导图内容`
              : '编辑知识卡片与思维导图内容'}
            ；保存后卡片和思维导图会同步更新。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 摘要 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">核心总结（摘要）</label>
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="一句话概括，显示在卡片底部「核心总结」区"
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
                  <Input
                    value={block.subtitleEn}
                    onChange={(e) => updateBlock(index, { subtitleEn: e.target.value })}
                    placeholder="英文副标题（可选）"
                    className="h-8"
                  />
                  <Textarea
                    value={block.content}
                    onChange={(e) => updateBlock(index, { content: e.target.value })}
                    placeholder="区块内容，支持 Markdown（**加粗**、==高亮==、表格等）"
                    rows={4}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 流程步骤 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">梳理顺序（流程步骤）</label>
            <Textarea
              value={flowStepsText}
              onChange={(e) => setFlowStepsText(e.target.value)}
              placeholder="一行一步，显示在卡片「梳理顺序」区；留空则不显示"
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

export default EditKnowledgePointCardDialog;
