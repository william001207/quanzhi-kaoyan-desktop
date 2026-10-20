import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { KnowledgePoint } from '../../shared/api.interface';
import { ReviewService, type ReviewResult } from './review.service';
import {
  SubmitReviewDto,
  SubmitQuestionReviewDto,
  ReviewQueueQueryDto,
} from './dto/review.dto';

@Controller('api/review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('knowledge-points/:id')
  async submitKnowledgePoint(
    @Param('id') id: string,
    @Body() dto: SubmitReviewDto,
  ): Promise<ReviewResult> {
    return this.reviewService.submitKnowledgePointReview(id, dto);
  }

  @Post('questions/:id')
  async submitQuestion(
    @Param('id') id: string,
    @Body() dto: SubmitQuestionReviewDto,
  ): Promise<ReviewResult> {
    return this.reviewService.submitQuestionReview(id, dto);
  }

  @Get('queue')
  async getQueue(
    @Query() query: ReviewQueueQueryDto,
  ): Promise<KnowledgePoint[]> {
    return this.reviewService.getQueue(query);
  }
}
