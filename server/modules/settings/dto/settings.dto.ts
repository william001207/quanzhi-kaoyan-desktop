import { Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateUserSettingDto {
  @IsOptional()
  examDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyMinutes?: number;

  @IsOptional()
  @IsObject()
  dailyKpConfig?: Record<string, number>;

  @IsOptional()
  @IsObject()
  dailyQuestionConfig?: Record<string, number>;

  @IsOptional()
  @IsObject()
  mockExamScoreConfig?: Record<string, number>;

  @IsOptional()
  @IsBoolean()
  examMode?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightSyllabus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightExamFreq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightMastery?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightForgetting?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightWrong?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kpWeightOverdue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qWeightExamFreq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qWeightMastery?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qWeightWrong?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qWeightOverdue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qWeightDifficulty?: number;
}

export class ClearLearningDataDto {
  @IsString()
  @IsIn(['recall', 'question', 'all'])
  type!: 'recall' | 'question' | 'all';

  @IsString()
  @IsIn(['today', 'all'])
  range!: 'today' | 'all';
}
