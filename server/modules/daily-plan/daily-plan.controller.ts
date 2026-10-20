import {
   Body,
   Controller,
   Get,
   Param,
   Patch,
   Post,
   Query,
 } from '@nestjs/common';
 import type { DailyPlanItem, PaginatedResponse, KnowledgePoint, ExamQuestionBrief } from '../../shared/api.interface';
 import { DailyPlanService, type DailyPlanWithItems } from './daily-plan.service';
 import { AddManualItemsDto, CandidatesQueryDto, UpdateDailyPlanItemDto } from './dto/daily-plan.dto';

@Controller('api/daily-plan')
export class DailyPlanController {
  constructor(private readonly dailyPlanService: DailyPlanService) {}

  @Get('today')
  async getToday(): Promise<DailyPlanWithItems> {
    return this.dailyPlanService.getToday();
  }

  @Post('generate')
  async generate(): Promise<DailyPlanWithItems> {
    return this.dailyPlanService.generate();
  }

  @Get('items/:id')
  async getItem(@Param('id') id: string): Promise<DailyPlanItem> {
    return this.dailyPlanService.getItem(id);
  }

  @Patch('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateDailyPlanItemDto,
  ): Promise<DailyPlanItem> {
    return this.dailyPlanService.updateItem(id, dto);
  }

  @Post('manual-items')
  async addManualItems(
    @Body() dto: AddManualItemsDto,
  ): Promise<DailyPlanWithItems> {
    return this.dailyPlanService.addManualItems(
      dto.knowledgePointIds ?? [],
      dto.questionIds ?? [],
    );
  }

  @Get('candidates')
  async getCandidates(
    @Query() query: CandidatesQueryDto,
  ): Promise<PaginatedResponse<KnowledgePoint | ExamQuestionBrief>> {
    return this.dailyPlanService.getCandidates(query);
  }
}
