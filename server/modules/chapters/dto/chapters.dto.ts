import {
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChapterDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  parentChapterId?: string | null;

  @IsOptional()
  @IsIn(['exam_syllabus', 'textbook'])
  source?: 'exam_syllabus' | 'textbook';
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

export class ReorderChapterDto {
  @IsString()
  targetId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  newSortOrder!: number;
}
