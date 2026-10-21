import { Controller, Post } from '@nestjs/common';
import { DataExportService } from './data.service';

@Controller('api/data')
export class DataController {
  constructor(private readonly dataExportService: DataExportService) {}

  /**
   * 导出当前内容数据到 userData/export/ 目录。
   * 前端拿到返回的目录路径后提示用户去拷贝。
   */
  @Post('export')
  exportContent() {
    return this.dataExportService.exportContent();
  }
}
