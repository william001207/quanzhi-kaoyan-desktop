import { Controller, Get, Query } from '@nestjs/common';
import type { SearchResult } from '../../shared/api.interface';
import { SearchService } from './search.service';

@Controller('api/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('q') q: string): Promise<SearchResult> {
    return this.searchService.search(q);
  }
}
