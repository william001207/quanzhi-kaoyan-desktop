import { Controller, Get, Param } from '@nestjs/common';
import type { Subject } from '../../shared/api.interface';
import { SubjectsService } from './subjects.service';

@Controller('api/subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async findAll(): Promise<Subject[]> {
    return this.subjectsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Subject> {
    return this.subjectsService.findOne(id);
  }
}
