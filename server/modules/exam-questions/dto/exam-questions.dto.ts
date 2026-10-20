import { Injectable } from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { QuestionType, SelfRating } from '../../../shared/api.interface';

export class ExamQuestionListQueryDto {
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
  @Type(() => String)
  @IsString()
  questionType?: QuestionType;

  @IsOptional()
  @IsString()
  school?: string;

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
}

export class HighFreqQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn([
    'noun_explanation',
    'short_answer',
    'essay',
    'multiple_choice',
    'fill_blank',
    'other',
  ])
  questionType?: QuestionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SubmitQuestionResultDto {
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
  @IsString()
  userAnswer?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  mistakeReason?: string;
}

export class UpdateQuestionCardDataDto {
  @IsObject()
  cardData!: Record<string, unknown>;
}

export class UpdateQuestionAnswerDto {
  @IsOptional()
  @IsString()
  answer?: string;
}

export class UpdateQuestionTextDto {
  @IsString()
  questionText!: string;
}

export class UpdateQuestionDifficultyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty!: number;
}

export class AddKnowledgePointDto {
  @IsUUID()
  knowledgePointId!: string;
}

export class UpdateAnswerKeywordsDto {
  @IsArray()
  @IsString({ each: true })
  answerKeywords!: string[];
}

export class CreateExamQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  year!: number;

  @IsUUID()
  subjectId!: string;

  @Type(() => String)
  @IsString()
  @IsIn([
    'noun_explanation',
    'short_answer',
    'essay',
    'multiple_choice',
    'fill_blank',
    'other',
  ])
  questionType!: 'noun_explanation' | 'short_answer' | 'essay' | 'multiple_choice' | 'fill_blank' | 'other';

  @IsString()
  @MinLength(1)
  questionText!: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  answerKeywords?: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty!: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  knowledgePointIds?: string[];
}
