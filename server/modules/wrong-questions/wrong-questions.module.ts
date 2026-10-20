import { Module } from '@nestjs/common';
import { WrongQuestionsController } from './wrong-questions.controller';
import { WrongQuestionsService } from './wrong-questions.service';

@Module({
  controllers: [WrongQuestionsController],
  providers: [WrongQuestionsService],
})
export class WrongQuestionsModule {}
