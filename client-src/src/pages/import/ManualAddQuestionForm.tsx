import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  X,
  Star,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  QUESTION_TYPE_LABEL,
  type QuestionType,
  type Subject,
  type KnowledgePoint,
} from '@shared/api.interface';
import { getAll as getAllSubjects } from '@/api/subjects';
import { list as listKnowledgePoints } from '@/api/knowledge-points';
import { create as createQuestion } from '@/api/exam-questions';

const QUESTION_TYPES: QuestionType[] = [
  'noun_explanation',
  'short_answer',
  'essay',
  'multiple_choice',
  'fill_blank',
];

const formSchema = z.object({
  questionText: z.string().min(1, '题干不能为空'),
  answer: z.string().optional(),
  questionType: z.enum([
    'noun_explanation',
    'short_answer',
    'essay',
    'multiple_choice',
    'fill_blank',
  ]),
  subjectId: z.string().min(1, '请选择科目'),
  year: z.coerce.number().int().min(1990, '年份需大于 1990').max(2100, '年份需小于 2100'),
  source: z.string().optional(),
  difficulty: z.coerce.number().int().min(1).max(5),
  answerKeywordsText: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ManualAddQuestionFormProps {
  onAfterCreate?: (questionId: string) => void;
}

const ManualAddQuestionForm: React.FC<ManualAddQuestionFormProps> = ({
  onAfterCreate,
}) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedKps, setSelectedKps] = useState<KnowledgePoint[]>([]);
  const [kpSearch, setKpSearch] = useState('');
  const [kpOptions, setKpOptions] = useState<KnowledgePoint[]>([]);
  const [kpLoading, setKpLoading] = useState(false);
  const [kpPopoverOpen, setKpPopoverOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  const form = useForm<FormData, unknown, FormData>({
    resolver: zodResolver(formSchema) as unknown as Parameters<typeof useForm<FormData>>[0]['resolver'],
    defaultValues: {
      questionText: '',
      answer: '',
      questionType: 'short_answer',
      subjectId: '',
      year: new Date().getFullYear(),
      source: '',
      difficulty: 3,
      answerKeywordsText: '',
    },
  });

  const subjectId = form.watch('subjectId');

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    setSelectedKps([]);
    setKpOptions([]);
    setKpSearch('');
  }, [subjectId]);

  const searchKnowledgePoints = async (keyword: string, subjId: string) => {
    if (!subjId) return;
    setKpLoading(true);
    try {
      const result = await listKnowledgePoints({
        subjectId: subjId,
        keyword: keyword || undefined,
        pageSize: 20,
      });
      setKpOptions(result.items ?? []);
    } catch (err) {
      logger.error('搜索知识点失败', err);
    } finally {
      setKpLoading(false);
    }
  };

  useEffect(() => {
    if (!subjectId) {
      setKpOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchKnowledgePoints(kpSearch, subjectId);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [kpSearch, subjectId]);

  const handleToggleKp = (kp: KnowledgePoint) => {
    setSelectedKps((prev) => {
      const exists = prev.some((p) => p.id === kp.id);
      if (exists) return prev.filter((p) => p.id !== kp.id);
      return [...prev, kp];
    });
  };

  const handleRemoveKp = (id: string) => {
    setSelectedKps((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true);
    setSuccessId(null);
    try {
      const answerKeywords = data.answerKeywordsText
        ? data.answerKeywordsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [];

      const result = await createQuestion({
        year: data.year,
        subjectId: data.subjectId,
        questionType: data.questionType,
        questionText: data.questionText,
        answer: data.answer || undefined,
        answerKeywords,
        source: data.source || undefined,
        difficulty: data.difficulty,
        knowledgePointIds: selectedKps.map((kp) => kp.id),
      });

      setSuccessId(result.id);
      toast.success('真题已添加');
      onAfterCreate?.(result.id);
    } catch (error) {
      logger.error('添加真题失败', error);
      const message =
        error instanceof Error ? error.message : '添加失败，请重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  });

  const handleContinue = () => {
    form.reset({
      questionText: '',
      answer: '',
      questionType: form.getValues('questionType'),
      subjectId: form.getValues('subjectId'),
      year: form.getValues('year'),
      source: form.getValues('source'),
      difficulty: form.getValues('difficulty'),
      answerKeywordsText: '',
    });
    setSelectedKps([]);
    setSuccessId(null);
  };

  const selectedKpIds = useMemo(
    () => new Set(selectedKps.map((kp) => kp.id)),
    [selectedKps],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="questionText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                题干 <span aria-hidden="true" className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="请输入真题题干"
                  className="min-h-[100px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>答案</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="请输入参考答案（可选）"
                  className="min-h-[80px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap gap-4">
          <FormField
            control={form.control}
            name="questionType"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[160px]">
                <FormLabel>
                  题型 <span aria-hidden="true" className="text-destructive">*</span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择题型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {QUESTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {QUESTION_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subjectId"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[160px]">
                <FormLabel>
                  科目 <span aria-hidden="true" className="text-destructive">*</span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择科目" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[120px]">
                <FormLabel>
                  年份 <span aria-hidden="true" className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="年份"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[160px]">
                <FormLabel>院校 / 来源</FormLabel>
                <FormControl>
                  <Input placeholder="如：某校真题" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[160px]">
                <FormLabel>难度</FormLabel>
                <div className="flex items-center gap-1 h-10">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => field.onChange(n)}
                      className="p-1 hover:scale-110 transition-transform"
                      aria-label={`难度 ${n} 星`}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          n <= (field.value ?? 3)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/40'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-sm text-muted-foreground ml-2">
                    {field.value ?? 3} 星
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="answerKeywordsText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>答案要点</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="每行一个答案要点，如：&#10;定义&#10;适应证&#10;优缺点"
                  className="min-h-[80px] resize-y"
                  {...field}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                每行一条，用于答题后自动比对得分点
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>关联知识点</FormLabel>
          <div className="mt-1.5">
            <Popover
              open={kpPopoverOpen}
              onOpenChange={setKpPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={!subjectId}
                >
                  <span className="truncate">
                    {selectedKps.length > 0
                      ? `已选 ${selectedKps.length} 个知识点`
                      : subjectId
                        ? '搜索并选择知识点'
                        : '请先选择科目'}
                  </span>
                  {kpPopoverOpen ? (
                    <ChevronUp className="h-4 w-4 ml-2 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="搜索知识点..."
                      className="pl-8"
                      value={kpSearch}
                      onChange={(e) => setKpSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                <ScrollArea className="max-h-60">
                  {kpLoading && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      搜索中...
                    </div>
                  )}
                  {!kpLoading && kpOptions.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      {subjectId ? '没有找到匹配的知识点' : '请先选择科目'}
                    </div>
                  )}
                  {!kpLoading &&
                    kpOptions.length > 0 &&
                    kpOptions.map((kp) => {
                      const checked = selectedKpIds.has(kp.id);
                      return (
                        <div
                          key={kp.id}
                          className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${
                            checked ? 'bg-primary/5' : ''
                          }`}
                          onClick={() => handleToggleKp(kp)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleKp(kp);
                            }
                          }}
                        >
                          <Checkbox checked={checked} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{kp.title}</div>
                            {checked && (
                              <div className="text-xs text-primary mt-0.5">
                                已添加
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </ScrollArea>
                {selectedKps.length > 0 && (
                  <div className="p-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                    <span>已选 {selectedKps.length} 个</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setSelectedKps([])}
                    >
                      清空
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {selectedKps.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedKps.map((kp) => (
                  <Badge
                    key={kp.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    <span className="max-w-[200px] truncate">
                      {kp.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKp(kp.id)}
                      className="hover:bg-background rounded p-0.5"
                      aria-label={`移除 ${kp.title}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          {successId ? (
            <>
              <Button type="button" onClick={handleContinue}>
                <Plus className="h-4 w-4 mr-1.5" />
                继续添加下一道
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                添加成功
              </div>
            </>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '保存到题库'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default ManualAddQuestionForm;
