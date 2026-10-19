/* eslint-disable */
/**
 * 平台兼容层（本地替代 @lark-apaas/fullstack-nestjs-core）
 * 提供：DRIZZLE_DATABASE 注入令牌、PlatformModule.forRoot()、configureApp()、
 *       PostgresJsDatabase 类型（指向 drizzle pglite 数据库类型）
 */
import { Module, ValidationPipe, type DynamicModule, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from '../database/schema';
import { getDrizzle, initializeDatabase } from '../database/local-db';

export const DRIZZLE_DATABASE = Symbol('DRIZZLE_DATABASE');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PostgresJsDatabase = any;

@Module({})
export class PlatformModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformModule,
      global: true,
      providers: [
        {
          provide: DRIZZLE_DATABASE,
          useFactory: async (): Promise<PostgresJsDatabase> => {
            await initializeDatabase();
            return getDrizzle();
          },
        },
      ],
      exports: [DRIZZLE_DATABASE],
    };
  }
}

export async function configureApp(
  app: NestExpressApplication,
  options?: { disableSwagger?: boolean },
): Promise<void> {
  // 客户端与本地服务同源，CORS 仅作兜底
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // 全局参数校验/转换（与线上平台行为一致：transform 开启）
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidNonWhitelisted: false,
    }),
  );

  app.use(cookieParser() as any);

  // 兼容线上基路径 /app/app_17g1b8sj7x4：剥掉前缀，保证客户端按线上写法请求也能命中
  app.use((req: any, _res: any, next: any) => {
    if (req.url.startsWith('/app/app_17g1b8sj7x4')) {
      req.url = req.url.replace(/^\/app\/app_17g1b8sj7x4/, '') || '/';
    }
    next();
  });

  // 客户端 React Router 使用 basename=/app/app_17g1b8sj7x4 渲染，
  // 根路径需重定向到基路径，否则页面空白（用 originalUrl 判断，避免前缀剥除后误判）
  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl === '/' || req.originalUrl === '') {
      return res.redirect('/app/app_17g1b8sj7x4/');
    }
    next();
  });

  // 本地 CSRF 双提交头放行（桌面端本地可信环境）
  app.use((req: any, res: any, next: any) => {
    if (!req.cookies?.['suda-csrf-token']) {
      res.cookie('suda-csrf-token', 'desktop-local-csrf-token', {
        httpOnly: false,
        sameSite: 'lax',
      });
    }
    next();
  });

  // ViewController 读取的平台注入数据
  app.use((req: any, _res: any, next: any) => {
    (req as any).__platform_data__ = {};
    next();
  });

  if (options?.disableSwagger !== false) {
    // 本地版不提供 swagger
  }
}
