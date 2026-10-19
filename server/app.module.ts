import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { PlatformModule } from './platform';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';

import { SubjectsModule } from './modules/subjects/subjects.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { KnowledgePointsModule } from './modules/knowledge-points/knowledge-points.module';
import { ExamQuestionsModule } from './modules/exam-questions/exam-questions.module';
import { DailyPlanModule } from './modules/daily-plan/daily-plan.module';
import { ReviewModule } from './modules/review/review.module';
import { WrongQuestionsModule } from './modules/wrong-questions/wrong-questions.module';
import { StatsModule } from './modules/stats/stats.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ImportModule } from './modules/import/import.module';
import { SearchModule } from './modules/search/search.module';
import { MockExamModule } from './modules/mock-exam/mock-exam.module';

@Module({
  imports: [
    PlatformModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      ttl: 5 * 60 * 1000,
      max: 100,
    }),
    SubjectsModule,
    ChaptersModule,
    KnowledgePointsModule,
    ExamQuestionsModule,
    DailyPlanModule,
    ReviewModule,
    WrongQuestionsModule,
    StatsModule,
    SettingsModule,
    ImportModule,
    SearchModule,
    MockExamModule,
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
