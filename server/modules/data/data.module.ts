import { Module } from '@nestjs/common';
import { DataController } from './data.controller';
import { DataExportService } from './data.service';

@Module({
  controllers: [DataController],
  providers: [DataExportService],
})
export class DataModule {}
