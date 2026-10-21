import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
   AlertCircle,
   FileText,
   Clock,
   ChevronRight,
   Trash2,
   Pencil,
   Printer,
 } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import * as api from '@/api';
import type {
  Subject,
  MockExamQuestionType,
  ExamPaperListItem,
  GeneratePaperResult,
  MockExamScoreConfig,
  ExamPaperTemplate,
} from '@shared/api.interface';
import {
  QUESTION_TYPE_LABEL,
  DEFAULT_MOCK_EXAM_SCORE_CONFIG,
} from '@shared/api.interface';
import { showConfirm } from '@lark-apaas/client-toolkit';

const QUESTION_TYPES: MockExamQuestionType[] = [
  'noun_explanation',
  'short_answer',
  'essay',
];

function isValidScore(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

function getScore(
  config: MockExamScoreConfig,
  type: MockExamQuestionType,
): number {
  return config[type] ?? DEFAULT_MOCK_EXAM_SCORE_CONFIG[type];
}

const TYPE_MINUTES: Record<MockExamQuestionType, number> = {
  noun_explanation: 8,
  short_answer: 15,
  essay: 20,
};

const DEFAULT_COUNTS: Record<MockExamQuestionType, number> = {
  noun_explanation: 5,
  short_answer: 4,
  essay: 1,
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function defaultDateSuffix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MockExamIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [yearStart, setYearStart] = useState<string>('');
  const [yearEnd, setYearEnd] = useState<string>('');
  const [questionCounts, setQuestionCounts] = useState<
    Record<MockExamQuestionType, number>
  >(DEFAULT_COUNTS);
  const [scoreConfig, setScoreConfig] = useState<MockExamScoreConfig>(
    DEFAULT_MOCK_EXAM_SCORE_CONFIG,
  );
  const [scoreErrors, setScoreErrors] = useState<
    Partial<Record<MockExamQuestionType, string>>
  >({});
  const [generating, setGenerating] = useState(false);
  const [availability, setAvailability] = useState<
    GeneratePaperResult['availability'] | null
  >(null);

  // 按院校年份整套
  const [yearSource, setYearSource] = useState('');
  const [year, setYear] = useState<string>('2024');
  const [yearScoreConfig, setYearScoreConfig] = useState<MockExamScoreConfig>(
    DEFAULT_MOCK_EXAM_SCORE_CONFIG,
  );
  const [yearScoreErrors, setYearScoreErrors] = useState<
    Partial<Record<MockExamQuestionType, string>>
  >({});
  const [yearGenerating, setYearGenerating] = useState(false);

  // 我的试卷
  const [recentPapers, setRecentPapers] = useState<ExamPaperListItem[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);

  // 我的模板
  const [templates, setTemplates] = useState<ExamPaperTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'papers'>('papers');

  // 保存模板对话框
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [saveTemplateMode, setSaveTemplateMode] = useState<'custom' | 'by_year'>('custom');
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateSubmitting, setSaveTemplateSubmitting] = useState(false);

  // 重命名模板对话框
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingTemplate, setRenamingTemplate] = useState<ExamPaperTemplate | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const loadPapers = async () => {
    setPapersLoading(true);
    try {
      const data = await api.mockExam.getPapers({ page: 1, pageSize: 8 });
      setRecentPapers(data.items);
    } catch (err) {
      logger.error('加载试卷列表失败', err);
    } finally {
      setPapersLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const data = await api.mockExam.getTemplates({ page: 1, pageSize: 8 });
      setTemplates(data.items);
    } catch (err) {
      logger.error('加载模板列表失败', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setSubjectsLoading(true);
      try {
        const data = await api.subjects.getAll();
        setSubjects(data);
        setSelectedSubjectIds(data.map((s) => s.id));
      } catch (err) {
        logger.error('加载科目失败', err);
        toast.error('加载科目失败');
      } finally {
        setSubjectsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.settings.get();
        if (settings.mockExamScoreConfig) {
          const merged: MockExamScoreConfig = {
            ...DEFAULT_MOCK_EXAM_SCORE_CONFIG,
            ...settings.mockExamScoreConfig,
          };
          setScoreConfig(merged);
          setYearScoreConfig(merged);
        }
      } catch (err) {
        logger.error('加载设置失败', err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    void loadPapers();
    void loadTemplates();
  }, []);

  const totalQuestions = useMemo(
    () => Object.values(questionCounts).reduce((sum, n) => sum + n, 0),
    [questionCounts],
  );

  const totalScore = useMemo(
    () =>
      (Object.keys(questionCounts) as MockExamQuestionType[]).reduce(
        (sum, type) =>
          sum + questionCounts[type] * getScore(scoreConfig, type),
        0,
      ),
    [questionCounts, scoreConfig],
  );

  const estimatedMinutes = useMemo(
    () =>
      (Object.keys(questionCounts) as MockExamQuestionType[]).reduce(
        (sum, type) => sum + questionCounts[type] * TYPE_MINUTES[type],
        0,
      ),
    [questionCounts],
  );

  const allSubjectsSelected =
    subjects.length > 0 && selectedSubjectIds.length === subjects.length;

  const toggleAllSubjects = () => {
    if (allSubjectsSelected) {
      setSelectedSubjectIds([]);
    } else {
      setSelectedSubjectIds(subjects.map((s) => s.id));
    }
  };

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const updateCount = (type: MockExamQuestionType, value: string) => {
    const n = Math.min(30, Math.max(0, parseInt(value, 10) || 0));
    setQuestionCounts((prev) => ({ ...prev, [type]: n }));
  };

  const updateScore = (type: MockExamQuestionType, value: string) => {
    const raw = value.trim();
    const n = parseInt(raw, 10);
    setScoreConfig((prev) => ({ ...prev, [type]: Number.isNaN(n) ? 0 : n }));
    if (raw === '' || !isValidScore(n)) {
      setScoreErrors((prev) => ({
        ...prev,
        [type]: '请输入 1-100 的正整数',
      }));
    } else {
      setScoreErrors((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    }
  };

  const updateYearScore = (type: MockExamQuestionType, value: string) => {
    const raw = value.trim();
    const n = parseInt(raw, 10);
    setYearScoreConfig((prev) => ({
      ...prev,
      [type]: Number.isNaN(n) ? 0 : n,
    }));
    if (raw === '' || !isValidScore(n)) {
      setYearScoreErrors((prev) => ({
        ...prev,
        [type]: '请输入 1-100 的正整数',
      }));
    } else {
      setYearScoreErrors((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    }
  };

  const validateScoreConfig = (
    config: MockExamScoreConfig,
    activeTypes: MockExamQuestionType[],
  ): boolean => {
    for (const type of activeTypes) {
      const val = config[type];
      if (val === undefined || !isValidScore(val)) {
        return false;
      }
    }
    return true;
  };

  const saveScoreConfig = async (config: MockExamScoreConfig) => {
    try {
      await api.settings.update({ mockExamScoreConfig: config });
    } catch (err) {
      logger.error('保存分值设置失败', err);
      toast.warning('试卷已生成，但分值设置保存失败');
    }
  };

  const generateCustomPaper = async (paperTitle: string) => {
    if (totalQuestions === 0) {
      toast.error('请先选择题目类型并填写题目数量');
      return null;
    }
    const typesWithCount = QUESTION_TYPES.filter((t) => questionCounts[t] > 0);
    if (!validateScoreConfig(scoreConfig, typesWithCount)) {
      toast.error('请检查每题分值，需为 1-100 的正整数');
      return null;
    }
    const activeScoreConfig: MockExamScoreConfig = {};
    for (const t of typesWithCount) {
      activeScoreConfig[t] = scoreConfig[t];
    }
    setGenerating(true);
    setAvailability(null);
    try {
      const paper = await api.mockExam.generatePaper({
        subjectIds: selectedSubjectIds,
        source: source.trim() || undefined,
        yearStart: yearStart ? parseInt(yearStart, 10) : undefined,
        yearEnd: yearEnd ? parseInt(yearEnd, 10) : undefined,
        questionTypes: typesWithCount,
        questionCounts: questionCounts,
        scoreConfig: activeScoreConfig,
        title: paperTitle.trim() || undefined,
      });
      setAvailability(paper.availability);
      void saveScoreConfig(scoreConfig);
      return paper;
    } catch (err: any) {
      logger.error('生成试卷失败', err);
      const msg =
        err?.response?.data?.error?.message || '生成试卷失败，请重试';
      toast.error(msg);
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const openSaveTemplateDialog = (mode: 'custom' | 'by_year') => {
    setSaveTemplateMode(mode);
    setSaveTemplateName(`组卷设置_${defaultDateSuffix()}`);
    setSaveTemplateSubmitting(false);
    setSaveTemplateDialogOpen(true);
  };

  const handleConfirmSaveTemplate = async () => {
    const trimmedName = saveTemplateName.trim();
    if (!trimmedName) {
      toast.error('模板名称不能为空');
      return;
    }
    setSaveTemplateSubmitting(true);
    try {
      if (saveTemplateMode === 'custom') {
        const typesWithCount = QUESTION_TYPES.filter(
          (t) => questionCounts[t] > 0,
        );
        const activeScoreConfig: MockExamScoreConfig = {};
        for (const t of typesWithCount) {
          activeScoreConfig[t] = scoreConfig[t];
        }
        await api.mockExam.createTemplate({
          name: trimmedName,
          mode: 'custom',
          subjectIds: selectedSubjectIds,
          source: source.trim() || undefined,
          yearStart: yearStart ? parseInt(yearStart, 10) : undefined,
          yearEnd: yearEnd ? parseInt(yearEnd, 10) : undefined,
          questionTypes: typesWithCount,
          questionCounts: questionCounts,
          scoreConfig: activeScoreConfig,
        });
      } else {
        const yearNum = parseInt(year, 10);
        await api.mockExam.createTemplate({
          name: trimmedName,
          mode: 'by_year',
          subjectIds: [],
          source: yearSource.trim(),
          yearStart: yearNum,
          yearEnd: yearNum,
          questionTypes: QUESTION_TYPES,
          questionCounts: {},
          scoreConfig: yearScoreConfig,
        });
      }
      toast.success('模板已保存');
      void loadTemplates();
      setActiveTab('templates');
      setSaveTemplateDialogOpen(false);
    } catch (err: any) {
      logger.error('保存模板失败', err);
      const msg =
        err?.response?.data?.error?.message || '保存模板失败，请重试';
      toast.error(msg);
    } finally {
      setSaveTemplateSubmitting(false);
    }
  };

  const handleSaveCustomTemplate = () => {
    if (totalQuestions === 0) {
      toast.error('请至少选择一道题');
      return;
    }
    const typesWithCount = QUESTION_TYPES.filter((t) => questionCounts[t] > 0);
    if (!validateScoreConfig(scoreConfig, typesWithCount)) {
      toast.error('请检查每题分值，需为 1-100 的正整数');
      return;
    }
    openSaveTemplateDialog('custom');
  };

  const handleGenerateCustomPaper = async () => {
    // Electron 禁用了 window.prompt（调用会直接抛错，表现为「点了没反应」），
    // 这里直接用带日期的默认名称生成，需要改名可在生成后的试卷上调整。
    const paper = await generateCustomPaper(`模拟卷_${defaultDateSuffix()}`);
    if (!paper) return;
    toast.success('试卷已生成');
    void loadPapers();
    setActiveTab('papers');
  };

  const generateByYearPaper = async (paperTitle: string) => {
    if (!yearSource.trim()) {
      toast.error('请输入院校名称');
      return null;
    }
    const yearNum = parseInt(year, 10);
    if (!yearNum) {
      toast.error('请输入有效年份');
      return null;
    }
    if (!validateScoreConfig(yearScoreConfig, QUESTION_TYPES)) {
      toast.error('请检查每题分值，需为 1-100 的正整数');
      return null;
    }
    setYearGenerating(true);
    try {
      const paper = await api.mockExam.generatePaperByYear({
        source: yearSource.trim(),
        year: yearNum,
        scoreConfig: yearScoreConfig,
        title: paperTitle.trim() || undefined,
      });
      void saveScoreConfig(yearScoreConfig);
      return paper;
    } catch (err: any) {
      logger.error('生成试卷失败', err);
      const msg =
        err?.response?.data?.error?.message || '生成试卷失败，请重试';
      toast.error(msg);
      return null;
    } finally {
      setYearGenerating(false);
    }
  };

  const handleSaveYearTemplate = () => {
    if (!yearSource.trim()) {
      toast.error('请输入院校名称');
      return;
    }
    const yearNum = parseInt(year, 10);
    if (!yearNum) {
      toast.error('请输入有效年份');
      return;
    }
    if (!validateScoreConfig(yearScoreConfig, QUESTION_TYPES)) {
      toast.error('请检查每题分值，需为 1-100 的正整数');
      return;
    }
    openSaveTemplateDialog('by_year');
  };

  const handleGenerateYearPaper = async () => {
    // 同上：不用 window.prompt，直接用默认名称
    const paper = await generateByYearPaper(`模拟卷_${defaultDateSuffix()}`);
    if (!paper) return;
    toast.success('试卷已生成');
    void loadPapers();
    setActiveTab('papers');
  };

  const handleStartPaper = async (paper: ExamPaperListItem) => {
    if (paper.status === 'not_started') {
      try {
        const startResult = await api.mockExam.startExam(paper.id);
        navigate(`/mock-exam/${startResult.recordId}`);
      } catch (err: any) {
        logger.error('开始考试失败', err);
        const msg =
          err?.response?.data?.error?.message || '开始考试失败，请重试';
        toast.error(msg);
      }
    } else if (paper.latestRecordId) {
      navigate(`/mock-exam/${paper.latestRecordId}`);
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    if (!await showConfirm('确定要删除这份试卷吗？')) return;
    try {
      await api.mockExam.deletePaper(paperId);
      toast.success('删除成功');
      void loadPapers();
    } catch (err: any) {
      logger.error('删除试卷失败', err);
      const msg =
        err?.response?.data?.error?.message || '删除失败，请重试';
      toast.error(msg);
    }
  };

  const handleLoadTemplate = (template: ExamPaperTemplate) => {
    if (template.mode === 'custom') {
      if (template.subjectIds?.length) {
        setSelectedSubjectIds(template.subjectIds);
      }
      setSource(template.source ?? '');
      setYearStart(template.yearStart ? String(template.yearStart) : '');
      setYearEnd(template.yearEnd ? String(template.yearEnd) : '');
      if (template.questionTypes?.length) {
        const counts: Record<MockExamQuestionType, number> = {
          noun_explanation: 0,
          short_answer: 0,
          essay: 0,
        };
        for (const t of template.questionTypes) {
          counts[t] = template.questionCounts?.[t] ?? 0;
        }
        setQuestionCounts(counts);
      }
      if (template.scoreConfig) {
        setScoreConfig({ ...scoreConfig, ...template.scoreConfig });
      }
    } else {
      setYearSource(template.source ?? '');
      if (template.yearStart) {
        setYear(String(template.yearStart));
      }
      if (template.scoreConfig) {
        setYearScoreConfig({ ...yearScoreConfig, ...template.scoreConfig });
      }
    }
    toast.success('已加载模板设置');
  };

  const openRenameDialog = (tpl: ExamPaperTemplate) => {
    setRenamingTemplate(tpl);
    setRenameName(tpl.name);
    setRenameSubmitting(false);
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renamingTemplate) return;
    const trimmedName = renameName.trim();
    if (!trimmedName) {
      toast.error('模板名称不能为空');
      return;
    }
    if (trimmedName === renamingTemplate.name) {
      setRenameDialogOpen(false);
      return;
    }
    setRenameSubmitting(true);
    try {
      await api.mockExam.updateTemplate(renamingTemplate.id, {
        name: trimmedName,
      });
      toast.success('已重命名');
      void loadTemplates();
      setRenameDialogOpen(false);
    } catch (err: any) {
      logger.error('重命名模板失败', err);
      const msg =
        err?.response?.data?.error?.message || '重命名失败，请重试';
      toast.error(msg);
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handlePrintPaper = (paper: ExamPaperListItem) => {
    // 在应用内跳转到打印页（不再新开窗口：新窗口在 Electron 下容易白屏，
    // 而且用户打印完还要手动关掉）。打印页里有「打印」按钮，走系统打印面板。
    navigate(`/mock-exam/print/${paper.id}`);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!await showConfirm('确定要删除这个模板吗？')) return;
    try {
      await api.mockExam.deleteTemplate(templateId);
      toast.success('删除成功');
      void loadTemplates();
    } catch (err: any) {
      logger.error('删除模板失败', err);
      const msg =
        err?.response?.data?.error?.message || '删除失败，请重试';
      toast.error(msg);
    }
  };

  const getTemplateSubtitle = (tpl: ExamPaperTemplate): string => {
    if (tpl.mode === 'by_year') {
      return `按年份 · ${tpl.yearStart ?? ''}年`;
    }
    const total = tpl.questionTypes.reduce(
      (sum: number, t: MockExamQuestionType) =>
        sum + (tpl.questionCounts?.[t] ?? 0),
      0,
    );
    return `自定义 · ${total} 题`;
  };

  const availabilityWarnings = useMemo(() => {
    const warnings: Array<{
      type: MockExamQuestionType;
      requested: number;
      available: number;
    }> = [];
    if (!availability) return warnings;
    for (const type of QUESTION_TYPES) {
      const av = availability[type];
      if (av && av.requested > av.available) {
        warnings.push({
          type,
          requested: av.requested,
          available: av.available,
        });
      }
    }
    return warnings;
  }, [availability]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">模拟考试</h1>
        <p className="text-sm text-muted-foreground mt-1">
          自定义组卷或按院校年份整套练习，全真模拟考试环境
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">组卷配置</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="custom">
            <TabsList className="mb-4">
              <TabsTrigger value="custom">自定义组卷</TabsTrigger>
              <TabsTrigger value="by-year">按院校年份整套</TabsTrigger>
            </TabsList>

            <TabsContent value="custom" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {/* 科目选择 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">科目选择</label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={toggleAllSubjects}
                        className="h-7 px-2 text-xs"
                      >
                        {allSubjectsSelected ? '全不选' : '全选'}
                      </Button>
                    </div>
                    {subjectsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-4/5" />
                        <Skeleton className="h-5 w-3/4" />
                      </div>
                    ) : (
                      <div className="border rounded-md p-3 pb-1 space-y-2 max-h-56 sm:max-h-40 overflow-y-auto">
                        {subjects.map((subject) => (
                          <label
                            key={subject.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded"
                          >
                            <Checkbox
                              checked={selectedSubjectIds.includes(
                                subject.id,
                              )}
                              onCheckedChange={() => toggleSubject(subject.id)}
                            />
                            <span>{subject.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 院校筛选 */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      院校筛选（可选，模糊匹配）
                    </label>
                    <Input
                      placeholder="输入院校名称，如：北京大学"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    />
                  </div>

                  {/* 年份范围 */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      年份范围（可选）
                    </label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={yearStart}
                        onValueChange={setYearStart}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="起始年份" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">不限</SelectItem>
                          {Array.from({ length: 15 }, (_, i) => 2025 - i).map(
                            (y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y} 年
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground text-sm">至</span>
                      <Select value={yearEnd} onValueChange={setYearEnd}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="结束年份" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">不限</SelectItem>
                          {Array.from({ length: 15 }, (_, i) => 2025 - i).map(
                            (y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y} 年
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 题型与题量 */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      题型与题量
                    </label>
                    <div className="space-y-3">
                      {QUESTION_TYPES.map((type) => {
                        const scoreVal = scoreConfig[type];
                        const hasError = !!scoreErrors[type];
                        const isActive = questionCounts[type] > 0;
                        return (
                          <div key={type} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm">
                                {QUESTION_TYPE_LABEL[type]}
                              </span>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={scoreVal ?? ''}
                                    onChange={(e) =>
                                      updateScore(type, e.target.value)
                                    }
                                    className={`w-16 text-center h-8 text-xs ${
                                      hasError && isActive
                                        ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                                        : ''
                                    }`}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    分/题
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={questionCounts[type]}
                                    onChange={(e) =>
                                      updateCount(type, e.target.value)
                                    }
                                    className="w-16 text-center h-8 text-xs"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    道
                                  </span>
                                </div>
                              </div>
                            </div>
                            {hasError && isActive && (
                              <div className="text-xs text-red-500 pl-24">
                                {scoreErrors[type]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 统计概览 */}
                  <div className="bg-muted/40 rounded-md p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">总题数</span>
                      <span className="font-medium">{totalQuestions} 道</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        满分
                      </span>
                      <span className="font-medium">{totalScore} 分</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        建议时长
                      </span>
                      <span className="font-medium">
                        {formatDuration(estimatedMinutes)}
                      </span>
                    </div>
                  </div>

                  {availabilityWarnings.length > 0 && (
                    <div className="flex items-start gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div>
                        {availabilityWarnings.map((w) => (
                          <div key={w.type}>
                            {QUESTION_TYPE_LABEL[w.type]}只有 {w.available}{' '}
                            道可用，已自动调整
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleSaveCustomTemplate}
                      disabled={totalQuestions === 0}
                      className="flex-1"
                    >
                      保存设置
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleGenerateCustomPaper}
                      disabled={generating}
                      className="flex-1"
                    >
                      {generating ? '生成中...' : '生成试卷'}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="by-year" className="space-y-6">
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">
                    院校名称
                  </label>
                  <Input
                    placeholder="如：北京大学"
                    value={yearSource}
                    onChange={(e) => setYearSource(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">年份</label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 15 }, (_, i) => 2025 - i).map(
                        (y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y} 年
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* 每题分值配置 */}
                <div>
                  <label className="text-sm font-medium block mb-2">
                    每题分值
                  </label>
                  <div className="space-y-2">
                    {QUESTION_TYPES.map((type) => {
                      const scoreVal = yearScoreConfig[type];
                      const hasError = !!yearScoreErrors[type];
                      return (
                        <div
                          key={type}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-sm">
                            {QUESTION_TYPE_LABEL[type]}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={scoreVal ?? ''}
                              onChange={(e) =>
                                updateYearScore(type, e.target.value)
                              }
                              className={`w-20 text-center h-8 text-xs ${
                                hasError
                                  ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                                  : ''
                              }`}
                            />
                            <span className="text-xs text-muted-foreground">
                              分/题
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(yearScoreErrors).length > 0 && (
                      <div className="text-xs text-red-500">
                        请输入 1-100 的正整数
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleSaveYearTemplate}
                    disabled={!yearSource.trim()}
                    className="flex-1"
                  >
                    保存设置
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleGenerateYearPaper}
                    disabled={yearGenerating || !yearSource.trim()}
                    className="flex-1"
                  >
                    {yearGenerating ? '生成中...' : '生成试卷'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 模板 / 试卷切换 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'templates' | 'papers')}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="templates">我的模板</TabsTrigger>
              <TabsTrigger value="papers">我的试卷</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link
            to="/mock-exam/history"
            className="text-sm text-primary hover:underline flex items-center"
          >
            查看全部 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {activeTab === 'templates' ? (
            templatesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-3/4" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无模板，保存你的组卷设置以便复用
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between py-3 -mx-2 px-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {tpl.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getTemplateSubtitle(tpl)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoadTemplate(tpl)}
                      >
                        加载
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="重命名模板"
                        onClick={() => openRenameDialog(tpl)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="删除模板"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : papersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-3/4" />
            </div>
          ) : recentPapers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无试卷，生成一套吧
            </div>
          ) : (
            <div className="divide-y">
              {recentPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="flex items-center justify-between py-3 -mx-2 px-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {paper.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {paper.totalQuestions} 题 · 满分 {paper.totalScore}{' '}
                      分 · 建议时长 {paper.estimatedMinutes} 分钟
                    </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/mock-exam/print/${paper.id}`)}
                      >
                        查看
                      </Button>
                      {paper.status === 'not_started' ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleStartPaper(paper)}
                        >
                          开始考试
                        </Button>
                      ) : paper.status === 'in_progress' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStartPaper(paper)}
                        >
                          继续考试
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartPaper(paper)}
                        >
                          查看结果
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="打印试卷"
                        onClick={() => handlePrintPaper(paper)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="删除试卷"
                        onClick={() => handleDeletePaper(paper.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 保存模板对话框 */}
      <Dialog
        open={saveTemplateDialogOpen}
        onOpenChange={setSaveTemplateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存模板</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium block mb-2">模板名称</label>
            <Input
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
              placeholder="请输入模板名称"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveTemplateDialogOpen(false)}
              disabled={saveTemplateSubmitting}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmSaveTemplate}
              disabled={saveTemplateSubmitting}
            >
              {saveTemplateSubmitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名模板对话框 */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名模板</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium block mb-2">模板名称</label>
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="请输入模板名称"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              disabled={renameSubmitting}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmRename}
              disabled={renameSubmitting}
            >
              {renameSubmitting ? '保存中...' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MockExamIndexPage;
