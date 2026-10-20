import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { SelfRating } from '../../../shared/api.interface';

export class SubmitReviewDto {
  @Type(() => String)
  @IsString()
  @IsIn(['again', 'hard', 'good', 'easy'])
  selfRating!: SelfRating;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  recallScore?: number;
}

export class SubmitQuestionReviewDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['again', 'hard', 'good', 'easy'])
  selfRating?: SelfRating;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  userAnswer?: string;

  @IsOptional()
  mistakeReason?: string;

  @IsOptional()
  knowledgePointIds?: string[];
}

export class ReviewQueueQueryDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['due', 'overdue', 'all'])
  type?: 'due' | 'overdue' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
