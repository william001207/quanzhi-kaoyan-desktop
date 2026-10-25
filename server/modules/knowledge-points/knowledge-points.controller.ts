import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import type {
  KnowledgePoint,
  ExamQuestion,
  ReviewRecord,
  PaginatedResponse,
} from '../../shared/api.interface';
import { KnowledgePointsService } from './knowledge-points.service';
import {
   KnowledgePointListQueryDto,
   CreateKnowledgePointDto,
   UpdateKnowledgePointDto,
   WeakMarkDto,
   AddQuestionDto,
 } from './dto/knowledge-points.dto';

@Controller('api/knowledge-points')
export class KnowledgePointsController {
  constructor(
    private readonly knowledgePointsService: KnowledgePointsService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateKnowledgePointDto,
  ): Promise<KnowledgePoint> {
    return this.knowledgePointsService.create(dto);
  }

  @Get()
  async findList(
    @Query() query: KnowledgePointListQueryDto,
  ): Promise<PaginatedResponse<KnowledgePoint>> {
    return this.knowledgePointsService.findList(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<KnowledgePoint> {
    return this.knowledgePointsService.findOne(id);
  }

  @Get(':id/questions')
  async findQuestions(
    @Param('id') id: string,
  ): Promise<ExamQuestion[]> {
    return this.knowledgePointsService.findQuestions(id);
  }

  @Get(':id/review-records')
  async findReviewRecords(
    @Param('id') id: string,
  ): Promise<ReviewRecord[]> {
    return this.knowledgePointsService.findReviewRecords(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgePointDto,
  ): Promise<KnowledgePoint> {
    return this.knowledgePointsService.update(id, dto);
  }

  @Post(':id/pin')
  async pin(@Param('id') id: string): Promise<KnowledgePoint> {
    return this.knowledgePointsService.pin(id);
  }

  @Post(':id/unpin')
  async unpin(@Param('id') id: string): Promise<KnowledgePoint> {
    return this.knowledgePointsService.unpin(id);
  }

  @Post(':id/weak-mark')
  async markWeak(
    @Param('id') id: string,
    @Body() dto: WeakMarkDto,
  ): Promise<KnowledgePoint> {
    return this.knowledgePointsService.markWeak(id, dto);
  }

  @Delete(':id/weak-mark')
  async unmarkWeak(@Param('id') id: string): Promise<KnowledgePoint> {
    return this.knowledgePointsService.unmarkWeak(id);
  }

  @Post('recalculate-statuses')
  async recalculateStatuses(): Promise<{ updated: number }> {
    return this.knowledgePointsService.recalculateAllStatuses();
  }

  @Post(':id/questions')
  async addQuestion(
    @Param('id') id: string,
    @Body() dto: AddQuestionDto,
  ): Promise<ExamQuestion[]> {
    await this.knowledgePointsService.addQuestion(id, dto.questionId);
    return this.knowledgePointsService.findQuestions(id);
  }

  @Delete(':id/questions/:questionId')
  async removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ): Promise<ExamQuestion[]> {
    await this.knowledgePointsService.removeQuestion(id, questionId);
    return this.knowledgePointsService.findQuestions(id);
  }
}
