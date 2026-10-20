import { Module } from '@nestjs/common';
import { ExamQuestionsController } from './exam-questions.controller';
import { ExamQuestionsService } from './exam-questions.service';

@Module({
  controllers: [ExamQuestionsController],
  providers: [ExamQuestionsService],
})
export class ExamQuestionsModule {}
