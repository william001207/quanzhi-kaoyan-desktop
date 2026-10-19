import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from './platform';
import { initializeDatabase } from './database/local-db';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hbs = require('hbs');

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // 先确保本地数据库就绪（建表 + 数据导入）
  await initializeDatabase();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  await configureApp(app, {
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '127.0.0.1';
  const port = Number(process.env.SERVER_PORT || '17890');

  // 客户端静态资源目录（index.html + assets/）
  const clientDir = process.env.CLIENT_DIR || join(process.cwd(), '..', 'client');

  // 静态资源优先（存在即返回，否则落到路由）
  app.useStaticAssets(clientDir);

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(clientDir);
  app.setViewEngine('html');
  app.engine('html', hbs.__express);

  await app.listen(port, host);
  logger.log(`Server running on http://${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
  // Electron 主进程等待该标记后打开窗口
  console.log('DESKTOP_SERVER_READY');
}

bootstrap();
