import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
    WrongQuestionWithDetail,
    PaginatedResponse,
    TopWrongItem,
    WrongQuestionStats,
    WeakMarkKnowledgePoint,
  } from '../../shared/api.interface';
import { WrongQuestionsService } from './wrong-questions.service';
import {
    WrongQuestionListQueryDto,
    UpdateWrongQuestionDto,
    WrongQuestionTopQueryDto,
    AddWrongQuestionDto,
    RedoWrongQuestionDto,
    BatchRemoveWrongQuestionsDto,
    WeakKnowledgePointsQueryDto,
  } from './dto/wrong-questions.dto';

@Controller('api/wrong-questions')
export class WrongQuestionsController {
  constructor(
    private readonly wrongQuestionsService: WrongQuestionsService,
  ) {}

  @Get()
  async findList(
    @Query() query: WrongQuestionListQueryDto,
  ): Promise<PaginatedResponse<WrongQuestionWithDetail>> {
    return this.wrongQuestionsService.findList(query);
  }

   @Get('top')
   async getTop(
     @Query() query: WrongQuestionTopQueryDto,
   ): Promise<TopWrongItem[]> {
     return this.wrongQuestionsService.getTop(query);
   }

   @Get('weak-knowledge-points')
   async getWeakKnowledgePoints(
     @Query() query: WeakKnowledgePointsQueryDto,
   ): Promise<PaginatedResponse<WeakMarkKnowledgePoint>> {
     return this.wrongQuestionsService.getWeakKnowledgePoints(query);
   }

   @Get('stats')
   async getStats(): Promise<WrongQuestionStats> {
     return this.wrongQuestionsService.getStats();
   }

  @Get('by-question/:questionId')
  async getByQuestionId(
    @Param('questionId') questionId: string,
  ): Promise<WrongQuestionWithDetail | null> {
    return this.wrongQuestionsService.getByQuestionId(questionId);
  }

  @Post('add')
  async addToWrongBook(
    @Body() dto: AddWrongQuestionDto,
  ): Promise<WrongQuestionWithDetail> {
    return this.wrongQuestionsService.addToWrongBook(
      dto.questionId,
      dto.mistakeReason,
      dto.userAnswer,
    );
  }

  @Post(':id/redo')
  async redo(
    @Param('id') id: string,
    @Body() dto: RedoWrongQuestionDto,
  ): Promise<WrongQuestionWithDetail> {
    return this.wrongQuestionsService.redoResult(
      id,
      dto.score,
      dto.userAnswer,
      dto.mastered,
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWrongQuestionDto,
  ): Promise<WrongQuestionWithDetail> {
    return this.wrongQuestionsService.update(id, dto);
  }

   @Delete(':id')
   async remove(
     @Req() req: Request,
     @Param('id') id: string,
   ): Promise<{ success: true; id: string }> {
     const { userId } = (req as any).userContext;
     await this.wrongQuestionsService.remove(id, userId);
     return { success: true, id };
   }

   @Post('batch-remove')
   async batchRemove(
     @Body() dto: BatchRemoveWrongQuestionsDto,
   ): Promise<{ success: true; deletedCount: number }> {
     const deletedCount = await this.wrongQuestionsService.batchRemove(dto);
     return { success: true, deletedCount };
   }
 }
