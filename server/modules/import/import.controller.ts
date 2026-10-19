import { Body, Controller, Post } from '@nestjs/common';
import { ImportService } from './import.service';
import type {
  SyllabusPreview,
  QuestionPreview,
  ImportResult,
} from '../../shared/api.interface';

@Controller('api/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  // --- 大纲导入 ---
  @Post('syllabus/preview')
  async previewSyllabus(
    @Body() body: { data: unknown },
  ): Promise<SyllabusPreview> {
    return this.importService.previewSyllabus(body.data);
  }

  @Post('syllabus')
  async executeSyllabus(
    @Body() body: { data: unknown },
  ): Promise<ImportResult> {
    return this.importService.importSyllabus(body.data);
  }

  // --- 真题导入 ---
  @Post('questions/preview')
  async previewQuestions(
    @Body() body: { data: unknown },
  ): Promise<QuestionPreview> {
    return this.importService.previewQuestions(body.data);
  }

  @Post('questions')
  async executeQuestions(
    @Body() body: { data: unknown },
  ): Promise<ImportResult> {
    return this.importService.importQuestions(body.data);
  }

  // --- 旧通用接口保留 ---
  @Post('preview')
  async preview(
    @Body() dto: { type?: string; data: unknown[] },
  ): Promise<{
    subjectsCount: number;
    chaptersCount: number;
    itemsCount: number;
    questionsCount: number;
    duplicates: string[];
  }> {
    return this.importService.preview(dto);
  }

  @Post('execute')
  async execute(
    @Body() dto: { type?: string; data: unknown[] },
  ): Promise<{ success: boolean; inserted: number }> {
    return this.importService.execute(dto);
  }
}
