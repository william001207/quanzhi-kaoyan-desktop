import { Injectable } from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export interface ImportPreviewResult {
  subjectsCount: number;
  chaptersCount: number;
  itemsCount: number;
  questionsCount: number;
  duplicates: string[];
}

export class ImportPreviewDto {
  @IsOptional()
  @IsString()
  type?: 'syllabus' | 'questions';

  @IsArray()
  data!: unknown[];
}

export class ImportExecuteDto {
  @IsOptional()
  @IsString()
  type?: 'syllabus' | 'questions';

  @IsArray()
  data!: unknown[];
}
