import { Body, Controller, Post } from '@nestjs/common';
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

  /**
   * 导出学习数据（掌握度/错题/复习记录/试卷/设置等个人进度）。
   * 返回完整数据，前端触发浏览器下载；同时备份一份到 export 目录。
   */
  @Post('export-learning')
  exportLearning() {
    return this.dataExportService.exportLearning();
  }

  /**
   * 导入学习数据（合并模式：按 id 覆盖/补齐，不删除本机记录）。
   * body 即导出文件的完整 JSON。
   */
  @Post('import-learning')
  importLearning(@Body() body: Record<string, any>) {
    return this.dataExportService.importLearning(body);
  }

  /**
   * 导入内容数据（题库/知识点/章节），body: { files: { 文件名: 文件内容 } }。
   * 复用启动时的增量同步逻辑，不触碰学习进度。
   */
  @Post('import-content')
  importContent(@Body() body: { files: Record<string, any> }) {
    return this.dataExportService.importContent(body?.files ?? {});
  }
}
