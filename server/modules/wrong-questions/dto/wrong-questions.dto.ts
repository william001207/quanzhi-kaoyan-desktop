import { Injectable } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, IsArray } from 'class-validator';
import type { MistakeReason, ErrorTag } from '../../../shared/api.interface';
import { ERROR_TAG_VALUES } from '../../../shared/api.interface';

export const MISTAKE_REASON_VALUES = [
  'knowledge_gap',
  'memory_blur',
  'reading_error',
  'expression_incomplete',
  'concept_confusion',
  'other',
] as const;

export class WrongQuestionListQueryDto {
   @IsOptional()
   @IsString()
   subjectId?: string;

   @IsOptional()
   @Type(() => String)
   @IsString()
   @IsIn(['true', 'false'])
   resolved?: string;

   @IsOptional()
   @Type(() => String)
   @IsString()
   @IsIn(MISTAKE_REASON_VALUES)
   mistakeReason?: MistakeReason;

   @IsOptional()
   @IsString()
   keyword?: string;

   @IsOptional()
   @Transform(({ value }) => {
     if (value === undefined || value === null || value === '') return undefined;
     if (Array.isArray(value)) return value;
     return String(value).split(',').filter(Boolean);
   })
   @IsArray()
   @IsString({ each: true })
   errorTags?: string[];

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
 }

export class UpdateWrongQuestionDto {
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(MISTAKE_REASON_VALUES)
  mistakeReason?: MistakeReason;

  @IsOptional()
  @IsString()
  userAnswer?: string;

  @IsOptional()
  @Type(() => String)
  @IsArray()
  @IsString({ each: true })
  errorTags?: ErrorTag[];
}

export class AddWrongQuestionDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(MISTAKE_REASON_VALUES)
  mistakeReason?: MistakeReason;

  @IsOptional()
  @IsString()
  userAnswer?: string;
}

export class RedoWrongQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @IsOptional()
  @IsBoolean()
  mastered?: boolean;

  @IsOptional()
  @IsString()
  userAnswer?: string;
}

export class WrongQuestionTopQueryDto {
   @IsOptional()
   @Type(() => Number)
   @IsInt()
   @Min(1)
   @Max(50)
   limit?: number;
 }

export class BatchRemoveWrongQuestionsDto {
   @IsOptional()
   @IsString({ each: true })
   ids?: string[];

   @IsOptional()
   @IsBoolean()
   onlyUnresolved?: boolean;
 }

export class WeakKnowledgePointsQueryDto {
   @IsOptional()
   @IsString()
   subjectId?: string;

   @IsOptional()
   @IsString()
   search?: string;

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
 }
