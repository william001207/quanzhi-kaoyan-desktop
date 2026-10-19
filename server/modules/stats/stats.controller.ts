import { Controller, Get, Query } from '@nestjs/common';
import type {
  StatsOverview,
  SubjectStats,
  MasteryDistribution,
  ReviewLoadDay,
  FreqMasteryPoint,
  HighFreqItem,
} from '../../shared/api.interface';
import { StatsService } from './stats.service';
import { ReviewLoadQueryDto, HighFreqQueryDto, DateRangeQueryDto } from './dto/stats.dto';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  async getOverview(
    @Query() query: DateRangeQueryDto,
  ): Promise<StatsOverview> {
    return this.statsService.getOverview(query);
  }

  @Get('by-subject')
  async getBySubject(
    @Query() query: DateRangeQueryDto,
  ): Promise<SubjectStats[]> {
    return this.statsService.getBySubject(query);
  }

  @Get('mastery-distribution')
  async getMasteryDistribution(
    @Query() query: DateRangeQueryDto,
  ): Promise<MasteryDistribution> {
    return this.statsService.getMasteryDistribution(query);
  }

  @Get('freq-mastery')
  async getFreqMastery(): Promise<FreqMasteryPoint[]> {
    return this.statsService.getFreqMastery();
  }

  @Get('review-load')
  async getReviewLoad(
    @Query() query: ReviewLoadQueryDto,
  ): Promise<ReviewLoadDay[]> {
    return this.statsService.getReviewLoad(query);
  }

  @Get('high-freq')
  async getHighFreq(
    @Query() query: HighFreqQueryDto,
  ): Promise<HighFreqItem[]> {
    return this.statsService.getHighFreq(query);
  }
}
