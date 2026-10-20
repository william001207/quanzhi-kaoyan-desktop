import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  GeneratePaperDto as IGeneratePaperDto,
  GenerateByYearDto as IGenerateByYearDto,
  CreateTemplateDto as ICreateTemplateDto,
  UpdateTemplateDto as IUpdateTemplateDto,
  MockExamQuestionType,
  ExamSelfRating,
} from '../../../shared/api.interface';

const MOCK_EXAM_TYPES: MockExamQuestionType[] = [
  'noun_explanation',
  'short_answer',
  'essay',
];

export class GeneratePaperDto implements IGeneratePaperDto {
  @IsArray()
  @IsString({ each: true })
  subjectIds!: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearStart?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearEnd?: number;

  // eslint-disable-next-line @darraghor/nestjs-typed/validated-non-primitive-property-needs-type-decorator
  @IsArray()
  @IsString({ each: true })
  @IsIn(MOCK_EXAM_TYPES, { each: true })
  questionTypes!: MockExamQuestionType[];

  @IsObject()
  questionCounts!: Partial<Record<MockExamQuestionType, number>>;

  @IsOptional()
  @IsObject()
  scoreConfig?: Record<string, number>;

  @IsOptional()
  @IsString()
  title?: string;
}

export class GenerateByYearDto implements IGenerateByYearDto {
  @IsString()
  source!: string;

  @IsInt()
  @Type(() => Number)
  year!: number;

  @IsOptional()
  @IsObject()
  scoreConfig?: Record<string, number>;

  @IsOptional()
  @IsString()
  title?: string;
}

export class StartExamDto {
  @IsString()
  paperId!: string;
}

export class SaveAnswerDto {
  @IsString()
  questionId!: string;

  @IsString()
  answer!: string;
}

export class SubmitExamDto {
  @IsObject()
  answers!: Record<string, string>;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  durationSeconds!: number;
}

export class CreateTemplateDto implements ICreateTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  @IsIn(['custom', 'by_year'])
  mode!: 'custom' | 'by_year';

  @IsArray()
  @IsString({ each: true })
  subjectIds!: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearStart?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearEnd?: number;

  // eslint-disable-next-line @darraghor/nestjs-typed/validated-non-primitive-property-needs-type-decorator
  @IsArray()
  @IsString({ each: true })
  @IsIn(MOCK_EXAM_TYPES, { each: true })
  questionTypes!: MockExamQuestionType[];

  @IsObject()
  questionCounts!: Record<string, number>;

  @IsObject()
  scoreConfig!: Record<string, number>;
}

export class UpdateTemplateDto implements IUpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @IsOptional()
  @IsString()
  source?: string | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearStart?: number | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  yearEnd?: number | null;

  // eslint-disable-next-line @darraghor/nestjs-typed/validated-non-primitive-property-needs-type-decorator
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(MOCK_EXAM_TYPES, { each: true })
  questionTypes?: MockExamQuestionType[];

  @IsOptional()
  @IsObject()
  questionCounts?: Record<string, number>;

  @IsOptional()
  @IsObject()
  scoreConfig?: Record<string, number>;
}

const SELF_RATINGS: ExamSelfRating[] = ['again', 'partial', 'basic', 'full'];

export class SelfRateDto {
  @IsString()
  questionId!: string;

  // eslint-disable-next-line @darraghor/nestjs-typed/validated-non-primitive-property-needs-type-decorator
  @IsString()
  @IsIn(SELF_RATINGS)
  rating!: ExamSelfRating;

  @IsBoolean()
  @Type(() => Boolean)
  addToWrong!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgePointIds?: string[];
}
