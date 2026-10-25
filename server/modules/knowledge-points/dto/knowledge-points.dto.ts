import { Injectable } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  /**
   * 是否连同下级章节一起筛选。
   * 大纲地图点「篇 / 章」时要看到其下所有「章 / 节」的知识点，否则父节点永远是空列表；
   * 不传则维持原来的精确匹配，避免影响其它调用方。
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  includeDescendants?: boolean;

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
