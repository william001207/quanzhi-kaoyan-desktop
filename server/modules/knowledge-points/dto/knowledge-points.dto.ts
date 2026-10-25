import { Injectable } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
   KnowledgePointStatus,
   RequirementLevel,
} from '../../../shared/api.interface';

export class KnowledgePointListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['weak', 'medium', 'familiar', 'mastered'])
  status?: KnowledgePointStatus;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['exam_syllabus', 'textbook'])
  source?: 'exam_syllabus' | 'textbook';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  weakMarked?: boolean;
}

export class WeakMarkDto {
  @IsOptional()
  @IsString()
  @IsIn(['unfamiliar', 'hard_to_remember', 'confusing', 'important'])
  reason?: 'unfamiliar' | 'hard_to_remember' | 'confusing' | 'important';
}

export class CreateKnowledgePointDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  chapterId!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['master', 'familiar', 'understand', 'unmarked'])
  requirementLevel?: RequirementLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  importanceScore?: number;

  @IsOptional()
  @IsObject()
  cardData?: Record<string, any>;
}

export class UpdateKnowledgePointDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['master', 'familiar', 'understand', 'unmarked'])
  requirementLevel?: RequirementLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  masteryScore?: number;

  @IsOptional()
  @IsObject()
  cardData?: Record<string, any>;
}

export class AddQuestionDto {
  @IsUUID()
  questionId!: string;
}
