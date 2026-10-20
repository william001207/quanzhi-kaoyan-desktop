import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  GeneratePaperResult,
  StartExamResult,
  ExamRecordDetail,
  SelfRateResult,
  ExamRecordListItem,
  ExamPaperListItem,
  PaginatedResponse,
   ExamPaperTemplate,
   ExamPaperDetail,
 } from '../../shared/api.interface';
import { MockExamService } from './mock-exam.service';
import {
  GeneratePaperDto,
  GenerateByYearDto,
  StartExamDto,
  SaveAnswerDto,
  SubmitExamDto,
  SelfRateDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/mock-exam.dto';

@Controller('api/mock-exam')
export class MockExamController {
  constructor(private readonly mockExamService: MockExamService) {}

  @Post('paper/generate')
  async generatePaper(
    @Body() dto: GeneratePaperDto,
  ): Promise<GeneratePaperResult> {
    return this.mockExamService.generatePaper(dto);
  }

  @Post('paper/generate-by-year')
  async generateByYear(
    @Body() dto: GenerateByYearDto,
  ): Promise<GeneratePaperResult> {
    return this.mockExamService.generateByYear(dto);
  }

  @Get('papers')
  async getPapers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamPaperListItem>> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 10;
    return this.mockExamService.getPapers(p, ps);
  }

  @Get('paper/:id')
  async getPaperDetail(@Param('id') id: string): Promise<ExamPaperDetail> {
    return this.mockExamService.getPaperDetail(id);
  }

  @Delete('papers/:id')
  async deletePaper(@Param('id') id: string): Promise<{ ok: boolean }> {
    return this.mockExamService.deletePaper(id);
  }

  @Post('record/start')
  async startExam(@Body() dto: StartExamDto): Promise<StartExamResult> {
    return this.mockExamService.startExam(dto.paperId);
  }

  @Patch('record/:id/answer')
  async saveAnswer(
    @Param('id') id: string,
    @Body() dto: SaveAnswerDto,
  ): Promise<{ ok: boolean }> {
    return this.mockExamService.saveAnswer(id, dto);
  }

  @Post('record/:id/submit')
  async submitExam(
    @Param('id') id: string,
    @Body() dto: SubmitExamDto,
  ): Promise<ExamRecordDetail> {
    return this.mockExamService.submitExam(id, dto);
  }

  @Post('record/:id/self-rate')
  async selfRate(
    @Param('id') id: string,
    @Body() dto: SelfRateDto,
  ): Promise<SelfRateResult> {
    return this.mockExamService.selfRate(id, dto);
  }

  @Get('records')
  async getRecords(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamRecordListItem>> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 10;
    return this.mockExamService.getRecords(p, ps);
  }

  @Get('record/:id')
  async getRecordDetail(@Param('id') id: string): Promise<ExamRecordDetail> {
    return this.mockExamService.getRecordDetail(id);
  }

  @Get('templates')
  async getTemplates(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamPaperTemplate>> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 10;
    return this.mockExamService.listTemplates(p, ps);
  }

  @Post('templates')
  async createTemplate(
    @Body() dto: CreateTemplateDto,
  ): Promise<ExamPaperTemplate> {
    return this.mockExamService.createTemplate(dto);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ExamPaperTemplate> {
    return this.mockExamService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string): Promise<{ ok: boolean }> {
    return this.mockExamService.deleteTemplate(id);
  }
}
