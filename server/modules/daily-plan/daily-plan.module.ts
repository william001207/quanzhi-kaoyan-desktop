import { Module } from '@nestjs/common';
import { DailyPlanController } from './daily-plan.controller';
import { DailyPlanService } from './daily-plan.service';

@Module({
  controllers: [DailyPlanController],
  providers: [DailyPlanService],
})
export class DailyPlanModule {}
