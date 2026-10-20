import { Controller, Get, Query, Post, Body, Patch, Param, Delete, ParseEnumPipe } from '@nestjs/common';
import type { Chapter, SyllabusMode } from '../../shared/api.interface';
import { ChaptersService, type ChapterTree } from './chapters.service';
import { CreateChapterDto, UpdateChapterDto } from './dto/chapters.dto';

@Controller('api/chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get()
  async findBySubject(
    @Query('subjectId') subjectId: string,
    @Query('source') source: SyllabusMode = 'exam_syllabus',
  ): Promise<Chapter[]> {
    return this.chaptersService.findBySubject(subjectId, source);
  }

  @Get('tree')
  async findTree(
    @Query('subjectId') subjectId: string,
    @Query('source') source: SyllabusMode = 'exam_syllabus',
  ): Promise<ChapterTree[]> {
    return this.chaptersService.findTree(subjectId, source);
  }

  @Post()
  async create(@Body() dto: CreateChapterDto): Promise<Chapter> {
    return this.chaptersService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateChapterDto,
  ): Promise<Chapter> {
    return this.chaptersService.update(id, dto);
  }

  @Post(':id/move')
  async move(
    @Param('id') id: string,
    @Body('direction') direction: 'up' | 'down',
  ): Promise<Chapter> {
    return this.chaptersService.move(id, direction);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.chaptersService.remove(id);
  }
}
