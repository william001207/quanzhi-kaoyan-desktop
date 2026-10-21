import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import {
  Upload,
  FileUp,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileJson,
  FilePlus,
} from 'lucide-react';
import {
  previewQuestions,
  executeQuestions,
  type QuestionPreview,
  type ImportResult,
  type UnmatchedKnowledgePointItem,
} from '@/api/import';
import ManualAddQuestionForm from './ManualAddQuestionForm';

const QUESTION_SAMPLE = `{
  "type": "questions",
  "data": [
    {
      "year": 2023,
      "source": "某校真题",
      "questions": [
        {
          "type": "名词解释",
          "subject": "口腔修复学",
          "question": "简述桩核冠的适应证",
          "answer": "桩核冠是利用桩核插入根管内以获得固位的一种全冠修复体...",
          "answerKeywords": ["定义", "适应证", "优缺点"],
          "notes": "常考考点，需重点掌握",
          "difficulty": "中",
          "knowledgePoints": ["桩核冠的适应症及优缺点"]
        },
        {
          "type": "简答题",
          "subject": "口腔组织病理学",
          "question": "试述牙源性腺样瘤的临床病理特点",
          "answer": "牙源性腺样瘤是一种良性牙源性肿瘤...",
          "answerKeywords": ["临床表现", "病理特点", "治疗原则"],
          "difficulty": 3,
          "knowledgePoints": ["牙源性腺样瘤的临床病理特点"]
        }
      ]
    }
  ]
}`;

const ImportPage: React.FC = () => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [previewData, setPreviewData] = useState<QuestionPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAndPreview = async (selectedFile: File) => {
    setFile(selectedFile);
    setPreviewData(null);
    setImportResult(null);
    setParsing(true);

    try {
      const text = await selectedFile.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        toast.error('JSON 解析失败，请检查文件格式');
        setParsing(false);
        return;
      }

      const result = await previewQuestions(data);
      setPreviewData(result);
    } catch (error) {
      logger.error('预览失败', error);
      const message =
        error instanceof Error ? error.message : '预览请求失败';
      toast.error(message);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.json')) {
      void readFileAndPreview(files[0]);
    } else {
      toast.error('请上传 .json 格式的文件');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void readFileAndPreview(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const result: ImportResult = await executeQuestions(data);

      setImportResult(result);
      if (result.success) {
        toast.success(result.message ?? '导入成功');
      } else {
        toast.error(result.message ?? '导入失败');
      }
    } catch (error) {
      logger.error('导入失败', error);
      const message =
        error instanceof Error ? error.message : '导入请求失败';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const questionPreview = previewData;

  const handleCopySample = (sample: string) => {
    void navigator.clipboard.writeText(sample).then(() => {
      toast.success('已复制到剪贴板');
    });
  };

  const renderUnmatchedList = (items: UnmatchedKnowledgePointItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">
              {items.length} 道题目有关联不上的知识点关键词
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              请确认关键词准确或先到「大纲地图」添加对应知识点
            </div>
          </div>
        </div>
        <div className="max-h-60 overflow-auto space-y-1.5 pt-1 border-t border-amber-200/60">
          {items.slice(0, 20).map((item, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">题目：</span>
              <span className="opacity-90">{item.questionText}</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {item.unmatchedKeywords.map((kw, ki) => (
                  <Badge key={ki} variant="outline" className="text-xs border-amber-300 bg-amber-50/50">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {items.length > 20 && (
            <div className="text-xs text-amber-600">... 还有 {items.length - 20} 道</div>
          )}
        </div>
      </div>
    );
  };

  const renderErrorList = (errors: string[]) => {
    if (errors.length === 0) return null;
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{errors.length} 条处理异常</div>
            <div className="max-h-40 overflow-auto space-y-1 mt-1">
              {errors.slice(0, 10).map((err, i) => (
                <div key={i} className="text-xs opacity-90">· {err}</div>
              ))}
              {errors.length > 10 && (
                <div className="text-xs opacity-70">... 还有 {errors.length - 10} 条</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUploadZone = () => (
    <div
      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <div className="text-sm font-medium mb-1">
        拖拽文件到此处，或
        <label className="text-primary cursor-pointer hover:underline ml-1">
          点击上传
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".json"
            onChange={handleFileChange}
          />
        </label>
      </div>
      <div className="text-xs text-muted-foreground">支持 JSON (.json) 格式</div>
      {file && (
        <div className="mt-4 text-sm text-muted-foreground">
          已选择：{file.name}
        </div>
      )}
    </div>
  );

  const renderStats = (items: Array<{ label: string; value: number }>) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="border rounded-lg px-4 py-3 bg-muted/30"
        >
          <div className="text-2xl font-semibold">{item.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-semibold mb-6">数据导入</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            导入真题数据
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="manual" className="w-full">
            <TabsList className="mb-5">
              <TabsTrigger value="manual" className="gap-2">
                <FilePlus className="h-4 w-4" />
                手动添加
              </TabsTrigger>
              <TabsTrigger value="json" className="gap-2">
                <FileJson className="h-4 w-4" />
                JSON 批量导入
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-0">
              <p className="text-sm text-muted-foreground mb-5">
                逐道填写真题信息并保存到题库，适合少量添加或快速补录。
              </p>
              <div className="max-w-2xl">
                <ManualAddQuestionForm />
              </div>
            </TabsContent>

            <TabsContent value="json" className="mt-0 space-y-6">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">格式说明</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  支持 JSON 格式上传。外层 <code className="bg-background px-1 rounded">type: &quot;questions&quot;</code>，
                  <code className="bg-background px-1 rounded">data</code> 按年份/来源分组，每组内含 <code className="bg-background px-1 rounded">questions</code> 数组。
                  可选字段：<code className="bg-background px-1 rounded">answerKeywords</code>（答案要点）、
                  <code className="bg-background px-1 rounded">notes</code>（解析）、
                  <code className="bg-background px-1 rounded">difficulty</code>（1-5 或易/中/难）。
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">最小示例 JSON</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1"
                    onClick={() => handleCopySample(QUESTION_SAMPLE)}
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </Button>
                </div>
                <pre className="mt-1 p-2 bg-background border rounded text-xs overflow-auto max-h-48 font-mono">
                  {QUESTION_SAMPLE}
                </pre>
              </div>

              {renderUploadZone()}

              {parsing && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  正在解析文件...
                </div>
              )}

              {!parsing && questionPreview && (
                <>
                  {renderStats([
                    { label: '年份数', value: questionPreview.yearCount },
                    { label: '科目数', value: questionPreview.subjectCount },
                    { label: '题目总数', value: questionPreview.questionCount },
                    { label: '预计重复', value: questionPreview.duplicateCount },
                  ])}

                  {questionPreview.duplicateCount > 0 && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        检测到 {questionPreview.duplicateCount} 道重复题目，导入时将自动跳过
                      </span>
                    </div>
                  )}

                  {renderUnmatchedList(questionPreview.unmatchedKnowledgePoints)}
                  {renderErrorList(questionPreview.errors)}

                  <div>
                    <h3 className="text-sm font-medium mb-3">数据预览（前 20 条）</h3>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">年份</TableHead>
                              <TableHead className="w-[100px]">题型</TableHead>
                              <TableHead>题目</TableHead>
                              <TableHead className="w-[200px] hidden sm:table-cell">关联知识点</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {questionPreview.preview.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-sm">{row.year}</TableCell>
                                <TableCell className="text-sm">
                                  <Badge variant="outline">{row.questionType}</Badge>
                                </TableCell>
                                <TableCell className="text-sm max-w-md truncate">
                                  {row.questionText}
                                </TableCell>
                                <TableCell className="text-sm hidden sm:table-cell">
                                  <div className="flex flex-wrap gap-1">
                                    {row.knowledgePoints.slice(0, 3).map((kp, ki) => (
                                      <Badge key={ki} variant="secondary" className="text-xs">
                                        {kp}
                                      </Badge>
                                    ))}
                                    {row.knowledgePoints.length > 3 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{row.knowledgePoints.length - 3}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={handleImport} disabled={importing}>
                      {importing ? '导入中...' : '开始导入'}
                    </Button>
                  </div>

                  {importResult && (
                    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm ${
                      importResult.success
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">{importResult.message}</div>
                        <div className="text-xs mt-0.5 opacity-80">
                          新增 {importResult.inserted} 道，跳过 {importResult.skipped} 道
                        </div>
                        {importResult.unmatchedKnowledgePoints && importResult.unmatchedKnowledgePoints.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-green-200/60">
                            <div className="text-xs font-medium mb-1">
                              未匹配知识点（{importResult.unmatchedKnowledgePoints.length} 道）：
                            </div>
                            <div className="max-h-32 overflow-auto space-y-1">
                              {importResult.unmatchedKnowledgePoints.slice(0, 10).map((item, i) => (
                                <div key={i} className="text-xs opacity-90">
                                  · {item.questionText}
                                  <span className="ml-1 opacity-70">
                                    未匹配：{item.unmatchedKeywords.join('、')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {importResult.errors && importResult.errors.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-red-200/60">
                            <div className="text-xs font-medium mb-1">
                              处理异常（{importResult.errors.length} 条）：
                            </div>
                            <div className="max-h-32 overflow-auto space-y-1">
                              {importResult.errors.slice(0, 5).map((err, i) => (
                                <div key={i} className="text-xs">· {err}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!parsing && !questionPreview && (
                <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                  上传文件后显示预览
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportPage;
