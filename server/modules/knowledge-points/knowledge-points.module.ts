import { Module } from '@nestjs/common';
import { KnowledgePointsController } from './knowledge-points.controller';
import { KnowledgePointsService } from './knowledge-points.service';

@Module({
  controllers: [KnowledgePointsController],
  providers: [KnowledgePointsService],
})
export class KnowledgePointsModule {}
