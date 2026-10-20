import { Injectable } from '@nestjs/common';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateDailyPlanItemDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class AddManualItemsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgePointIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];
}

export class CandidatesQueryDto {
  @IsOptional()
  @IsIn(['knowledge_point', 'question'])
  itemType!: 'knowledge_point' | 'question';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  @IsIn([
    'noun_explanation',
    'short_answer',
    'essay',
    'multiple_choice',
    'fill_blank',
    'other',
  ])
  questionType?: string;

  @IsOptional()
  @IsString()
  school?: string;
}
