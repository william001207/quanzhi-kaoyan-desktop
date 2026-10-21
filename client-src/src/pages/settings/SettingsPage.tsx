import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import type {
  UserSetting,
  Subject,
  ClearDataType,
  ClearDataRange,
  ClearDataResult,
} from '@shared/api.interface';
import { Calendar, Clock, Scale, AlertTriangle, BookOpen, Trash2 } from 'lucide-react';
import { invalidateStats } from '@/hooks/use-stats-refresh';

const DEFAULT_SUBJECTS: string[] = [
  '口腔颌面外科学',
  '口腔修复学',
  '牙体牙髓病学',
  '牙周病学',
  '口腔黏膜病学',
  '口腔正畸学',
  '口腔解剖生理学',
  '口腔组织病理学',
];

const SettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSetting | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.settings.get();
        setSettings(result);
      } catch (err) {
        logger.error('加载设置失败', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const list = await api.subjects.getAll();
        const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
        setSubjects(sorted);
      } catch (err) {
        logger.error('加载科目列表失败', err);
      } finally {
        setSubjectsLoading(false);
      }
    };
    loadSubjects();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await api.settings.update(settings);
      setSettings(result);
      toast.success('设置已保存');
    } catch (err) {
      logger.error('保存设置失败', err);
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof UserSetting>(
    key: K,
    value: UserSetting[K],
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleDailyKpChange = (subjectId: string, value: number) => {
    if (!settings) return;
    const clamped = Math.max(0, Math.min(50, Math.floor(value || 0)));
    const nextConfig = { ...(settings.dailyKpConfig || {}) };
    if (clamped === 10 && !nextConfig[subjectId]) {
      delete nextConfig[subjectId];
    } else {
      nextConfig[subjectId] = clamped;
    }
    setSettings({ ...settings, dailyKpConfig: nextConfig });
  };

  const getDailyKpValue = (subjectId: string): number => {
    if (!settings) return 10;
    const val = settings.dailyKpConfig?.[subjectId];
    return val !== undefined ? val : 10;
  };

  const handleSetAll = (value: number) => {
    if (!settings || subjects.length === 0) return;
    const clamped = Math.max(0, Math.min(50, Math.floor(value || 0)));
    const nextConfig: Record<string, number> = {};
    for (const subject of subjects) {
      if (clamped !== 10) {
        nextConfig[subject.id] = clamped;
      }
    }
    setSettings({ ...settings, dailyKpConfig: nextConfig });
  };

  const handleDailyQuestionChange = (subjectId: string, value: number) => {
    if (!settings) return;
    const clamped = Math.max(0, Math.min(20, Math.floor(value || 0)));
    const nextConfig = { ...(settings.dailyQuestionConfig || {}) };
    if (clamped === 3 && !nextConfig[subjectId]) {
      delete nextConfig[subjectId];
    } else {
      nextConfig[subjectId] = clamped;
    }
    setSettings({ ...settings, dailyQuestionConfig: nextConfig });
  };

  const getDailyQuestionValue = (subjectId: string): number => {
    if (!settings) return 3;
    const val = settings.dailyQuestionConfig?.[subjectId];
    return val !== undefined ? val : 3;
  };

  const handleSetAllQuestions = (value: number) => {
    if (!settings || subjects.length === 0) return;
    const clamped = Math.max(0, Math.min(20, Math.floor(value || 0)));
    const nextConfig: Record<string, number> = {};
    for (const subject of subjects) {
      if (clamped !== 3) {
        nextConfig[subject.id] = clamped;
      }
    }
    setSettings({ ...settings, dailyQuestionConfig: nextConfig });
  };

  const [clearDialog, setClearDialog] = useState<{
    type: ClearDataType;
    range: ClearDataRange;
    title: string;
    description: string;
  } | null>(null);
  const [clearing, setClearing] = useState(false);

  const openClearDialog = (
    type: ClearDataType,
    range: ClearDataRange,
    title: string,
    description: string,
  ) => {
    setClearDialog({ type, range, title, description });
  };

  const buildSuccessMessage = (
    type: ClearDataType,
    result: ClearDataResult,
  ): string => {
    const parts: string[] = [];
    if (type === 'recall' || type === 'all') {
      parts.push(`主动回忆记录 ${result.reviewRecordsDeleted} 条`);
      parts.push(`知识点掌握度重置 ${result.knowledgePointsReset} 个`);
    }
    if (type === 'question' || type === 'all') {
      parts.push(`真题作答记录 ${result.questionsReset} 道`);
      parts.push(`错题 ${result.wrongQuestionsDeleted} 道`);
    }
    if (type === 'all') {
      parts.push(`每日计划完成状态重置 ${result.dailyPlanItemsReset} 条`);
    }
    return `清除成功：${parts.join('，')}。建议刷新页面以更新数据。`;
  };

  const handleConfirmClear = async () => {
    if (!clearDialog) return;
    setClearing(true);
    try {
      const result = await api.settings.clearLearningData(
        clearDialog.type,
        clearDialog.range,
      );
      toast.success(buildSuccessMessage(clearDialog.type, result));
      invalidateStats();
      if (clearDialog.type === 'all') {
        window.dispatchEvent(new CustomEvent('daily-plan-cleared'));
      }
      setClearDialog(null);
    } catch (err) {
      logger.error('清除学习数据失败', err);
      toast.error('清除失败，请重试');
    } finally {
      setClearing(false);
    }
  };

  const kpTotalWeight = settings
    ? settings.kpWeightSyllabus +
      settings.kpWeightExamFreq +
      settings.kpWeightMastery +
      settings.kpWeightForgetting +
      settings.kpWeightWrong +
      settings.kpWeightOverdue
    : 100;

  const qTotalWeight = settings
    ? settings.qWeightExamFreq +
      settings.qWeightMastery +
      settings.qWeightWrong +
      settings.qWeightOverdue +
      settings.qWeightDifficulty
    : 100;

  return (
    <div className="p-3 md:p-6">
      <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">设置</h1>

      <div className="space-y-6 max-w-3xl">
        {/* 考试信息 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-medium">考试信息</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="examDate">考试日期</Label>
                  <Input
                    id="examDate"
                    type="date"
                    value={settings?.examDate ?? ''}
                    onChange={(e) => updateField('examDate', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    设置考试日期后，系统会自动计算倒计时并调整复习节奏
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>考前模式</Label>
                    <p className="text-xs text-muted-foreground">
                      开启后缩短复习间隔，优先覆盖高频考点
                    </p>
                  </div>
                  <Switch
                    checked={settings?.examMode ?? false}
                    onCheckedChange={(checked) =>
                      updateField('examMode', checked)
                    }
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 每日知识点容量 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-medium">
                每日知识点容量
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              每个科目每天安排的知识点学习/复习任务数（新学+复习合计），0 表示该科目不安排知识点任务
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading || subjectsLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : subjects.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <span className="text-sm text-muted-foreground">快速设置：</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(5)}
                  >
                    全部 5 个
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(10)}
                  >
                    全部 10 个
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(15)}
                  >
                    全部 15 个
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(20)}
                  >
                    全部 20 个
                  </Button>
                </div>
                {subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <Label className="text-sm font-normal flex-1 min-w-0 truncate">
                      {subject.name}
                    </Label>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={getDailyKpValue(subject.id)}
                        onChange={(e) =>
                          handleDailyKpChange(
                            subject.id,
                            parseInt(e.target.value, 10) || 0,
                          )
                        }
                        className="w-20 h-9 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        个/天
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {DEFAULT_SUBJECTS.map((name, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <Label className="text-sm font-normal flex-1 min-w-0 truncate">
                      {name}
                    </Label>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={10}
                        readOnly
                        className="w-20 h-9 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        个/天
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 每日真题默写容量 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-medium">
                每日真题默写容量
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              每个科目每天安排的真题默写数量，0 表示该科目不安排真题任务
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading || subjectsLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : subjects.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <span className="text-sm text-muted-foreground">快速设置：</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAllQuestions(0)}
                  >
                    全部 0 道
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAllQuestions(3)}
                  >
                    全部 3 道
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAllQuestions(5)}
                  >
                    全部 5 道
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAllQuestions(10)}
                  >
                    全部 10 道
                  </Button>
                </div>
                {subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <Label className="text-sm font-normal flex-1 min-w-0 truncate">
                      {subject.name}
                    </Label>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={getDailyQuestionValue(subject.id)}
                        onChange={(e) =>
                          handleDailyQuestionChange(
                            subject.id,
                            parseInt(e.target.value, 10) || 0,
                          )
                        }
                        className="w-20 h-9 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        道/天
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {DEFAULT_SUBJECTS.map((name, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <Label className="text-sm font-normal flex-1 min-w-0 truncate">
                      {name}
                    </Label>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={3}
                        readOnly
                        className="w-20 h-9 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        道/天
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 知识点排序权重 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-medium">
                知识点排序权重
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              作用于今日学习知识点、复习队列、知识点中心排序，总权重 {kpTotalWeight}%
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                {[
                  { key: 'kpWeightExamFreq' as const, label: '真题考频' },
                  { key: 'kpWeightSyllabus' as const, label: '大纲重要性' },
                  { key: 'kpWeightMastery' as const, label: '掌握度' },
                  { key: 'kpWeightForgetting' as const, label: '遗忘风险' },
                  { key: 'kpWeightWrong' as const, label: '错题' },
                  { key: 'kpWeightOverdue' as const, label: '逾期' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-4">
                    <Label className="w-24 flex-shrink-0 text-sm">
                      {item.label}
                    </Label>
                    <Slider
                      value={[settings?.[item.key] ?? 0]}
                      min={0}
                      max={50}
                      step={5}
                      className="flex-1"
                      onValueChange={([v]) => updateField(item.key, v)}
                    />
                    <span className="text-sm w-10 text-right">
                      {settings?.[item.key] ?? 0}%
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* 真题排序权重 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg font-medium">
                真题排序权重
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              作用于今日学习抽题、真题中心、错题本、答题队列，总权重 {qTotalWeight}%
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                {[
                  { key: 'qWeightExamFreq' as const, label: '真题考频' },
                  { key: 'qWeightMastery' as const, label: '掌握度' },
                  { key: 'qWeightWrong' as const, label: '错题' },
                  { key: 'qWeightOverdue' as const, label: '逾期' },
                  { key: 'qWeightDifficulty' as const, label: '题型难度' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-4">
                    <Label className="w-24 flex-shrink-0 text-sm">
                      {item.label}
                    </Label>
                    <Slider
                      value={[settings?.[item.key] ?? 0]}
                      min={0}
                      max={50}
                      step={5}
                      className="flex-1"
                      onValueChange={([v]) => updateField(item.key, v)}
                    />
                    <span className="text-sm w-10 text-right">
                      {settings?.[item.key] ?? 0}%
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* 考前模式详细配置提示 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-lg font-medium">考前模式</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              考前模式会缩短复习间隔（D0→D1→D2→D4→D7），并优先推送高频考点和薄弱知识点。
              建议在考前 30 天开启。
            </p>
          </CardContent>
        </Card>

        {/* 清除学习历史数据 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <CardTitle className="text-lg font-medium">
                清除学习历史数据
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              清除后数据将无法恢复，请谨慎操作
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 清除知识点学习记录 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">清除知识点学习记录</p>
                  <p className="text-xs text-muted-foreground">
                    清除主动回忆记录，知识点掌握度将重置
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openClearDialog(
                        'recall',
                        'today',
                        '确认清除？',
                        '将清除今日所有主动回忆记录，相关知识点掌握度将重置。此操作不可恢复。',
                      )
                    }
                  >
                    清除当日
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      openClearDialog(
                        'recall',
                        'all',
                        '确认清除？',
                        '将清空全部主动回忆记录，所有知识点掌握度将重置为未学习状态。此操作不可恢复。',
                      )
                    }
                  >
                    清除所有
                  </Button>
                </div>
              </div>
            </div>

            {/* 清除真题作答记录 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">清除真题作答记录</p>
                  <p className="text-xs text-muted-foreground">
                    清除真题答题记录和错题本数据
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openClearDialog(
                        'question',
                        'today',
                        '确认清除？',
                        '将清除今日所有真题作答记录和对应的错题记录。此操作不可恢复。',
                      )
                    }
                  >
                    清除当日
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      openClearDialog(
                        'question',
                        'all',
                        '确认清除？',
                        '将清空全部真题作答记录和错题本。此操作不可恢复。',
                      )
                    }
                  >
                    清除所有
                  </Button>
                </div>
              </div>
            </div>

            {/* 清除全部学习数据 */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">清除全部学习数据</p>
                  <p className="text-xs text-muted-foreground">
                    清空所有学习记录、错题和每日计划完成状态
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    openClearDialog(
                      'all',
                      'all',
                      '确认一键清空？',
                      '将清空全部主动回忆记录、真题作答记录、错题本和每日计划完成状态，所有知识点掌握度将重置。此操作不可恢复，请谨慎操作。',
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  一键清空
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 确认清除弹窗 */}
        <AlertDialog
          open={clearDialog !== null}
          onOpenChange={(open) => {
            if (!open && !clearing) setClearDialog(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{clearDialog?.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {clearDialog?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearing}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirmClear();
                  }}
                  disabled={clearing}
                >
                  {clearing ? '清除中...' : '确认清除'}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading || saving} className="h-10 min-h-[40px]">
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
