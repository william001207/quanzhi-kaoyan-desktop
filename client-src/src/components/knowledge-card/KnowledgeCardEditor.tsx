import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { KnowledgePointCardData } from '@shared/api.interface';
import * as api from '@/api/knowledge-points';
import { Plus, Trash2, Save, X } from 'lucide-react';

interface KnowledgeCardEditorProps {
  kpId: string;
  initialData: KnowledgePointCardData;
  onSaved: (data: KnowledgePointCardData) => void;
  onCancel: () => void;
}

const KnowledgeCardEditor: React.FC<KnowledgeCardEditorProps> = ({
  kpId,
  initialData,
  onSaved,
  onCancel,
}) => {
  const [flowSteps, setFlowSteps] = useState<string[]>(
    initialData.flowSteps ?? [],
  );
  const [blocks, setBlocks] = useState<
    Array<{ title: string; subtitleEn: string; content: string }>
  >(
    (initialData.blocks ?? []).map((b) => ({
      title: b.title,
      subtitleEn: b.subtitleEn ?? '',
      content: b.content,
    })),
  );
  const [summary, setSummary] = useState(initialData.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [flowInput, setFlowInput] = useState('');

  const addFlowStep = () => {
    if (!flowInput.trim()) return;
    setFlowSteps([...flowSteps, flowInput.trim()]);
    setFlowInput('');
  };

  const removeFlowStep = (idx: number) => {
    setFlowSteps(flowSteps.filter((_, i) => i !== idx));
  };

  const moveFlowStep = (idx: number, dir: -1 | 1) => {
    const newSteps = [...flowSteps];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= newSteps.length) return;
    [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
    setFlowSteps(newSteps);
  };

  const addBlock = () => {
    setBlocks([...blocks, { title: '', subtitleEn: '', content: '' }]);
  };

  const updateBlock = (
    idx: number,
    field: 'title' | 'subtitleEn' | 'content',
    value: string,
  ) => {
    const newBlocks = [...blocks];
    newBlocks[idx] = { ...newBlocks[idx], [field]: value };
    setBlocks(newBlocks);
  };

  const removeBlock = (idx: number) => {
    setBlocks(blocks.filter((_, i) => i !== idx));
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newBlocks = [...blocks];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= newBlocks.length) return;
    [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[idx]];
    setBlocks(newBlocks);
  };

  const handleSave = async () => {
    const validBlocks = blocks.filter((b) => b.title.trim() || b.content.trim());
    const data: KnowledgePointCardData = {
      flowSteps: flowSteps.length > 0 ? flowSteps : undefined,
      blocks: validBlocks.length > 0 ? validBlocks : undefined,
      summary: summary.trim() || undefined,
    };
    setSaving(true);
    try {
      const result = await api.updateCardData(kpId, data);
      toast.success('已保存');
      onSaved(result.cardData);
    } catch (err) {
      logger.error('保存卡片失败', err);
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-2 border-b">
        <h3 className="text-base font-semibold text-stone-800">
          编辑知识卡片
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" />
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* 流程步骤 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-stone-700">
          流程步骤（可选）
        </label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入步骤名称，回车或点添加"
            value={flowInput}
            onChange={(e) => setFlowInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFlowStep();
              }
            }}
            className="flex-1"
          />
          <Button size="sm" variant="outline" onClick={addFlowStep}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加
          </Button>
        </div>
        {flowSteps.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {flowSteps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded px-2.5 py-1 text-sm"
              >
                <span className="text-amber-700 font-bold text-xs mr-0.5">
                  {i + 1}.
                </span>
                <span className="text-stone-700">{step}</span>
                <button
                  onClick={() => moveFlowStep(i, -1)}
                  className="text-stone-400 hover:text-stone-600 ml-1 text-xs"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveFlowStep(i, 1)}
                  className="text-stone-400 hover:text-stone-600 text-xs"
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeFlowStep(i)}
                  className="text-stone-400 hover:text-red-500 ml-0.5"
                  aria-label="删除步骤"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分块内容 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">
            知识分块
          </label>
          <Button size="sm" variant="outline" onClick={addBlock}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加分块
          </Button>
        </div>
        <div className="space-y-4">
          {blocks.map((block, i) => (
            <div
              key={i}
              className="border border-stone-200 rounded-lg p-3 bg-stone-50/50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-stone-500">
                  分块 {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveBlock(i, -1)}
                    className="text-xs text-stone-400 hover:text-stone-600 px-1.5"
                    aria-label="上移"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveBlock(i, 1)}
                    className="text-xs text-stone-400 hover:text-stone-600 px-1.5"
                    aria-label="下移"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeBlock(i)}
                    className="text-stone-400 hover:text-red-500 p-1"
                    aria-label="删除分块"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="text-xs text-stone-500 mb-0.5 block">
                    块标题
                  </label>
                  <Input
                    placeholder="如：后缘封闭区"
                    value={block.title}
                    onChange={(e) => updateBlock(i, 'title', e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-stone-500 mb-0.5 block">
                    英文副标题（可选）
                  </label>
                  <Input
                    placeholder="如：posterior palatal seal area"
                    value={block.subtitleEn}
                    onChange={(e) =>
                      updateBlock(i, 'subtitleEn', e.target.value)
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-0.5 block">
                  内容（支持 Markdown）
                </label>
                <Textarea
                  placeholder="支持 Markdown：标题、表格、列表、加粗等..."
                  value={block.content}
                  onChange={(e) => updateBlock(i, 'content', e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部总结 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-stone-700">
          核心总结 / 记忆口诀（可选）
        </label>
        <Textarea
          placeholder="一句话总结或记忆口诀..."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
};

export default KnowledgeCardEditor;
