/* eslint-disable */
/**
 * 平台兼容层（本地替代 @lark-apaas/fullstack-nestjs-core）
 * 提供：DRIZZLE_DATABASE 注入令牌、PlatformModule.forRoot()、configureApp()、
 *       PostgresJsDatabase 类型（指向 drizzle pglite 数据库类型）
 */
import { Module, ValidationPipe, type DynamicModule, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
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
  // body 解析：main.ts 关掉了默认解析器，这里注册大上限版本
  // （导入内容数据 4 个 JSON 合计约 10MB+，默认 100kb 会直接 413）
  app.use(json({ limit: '64mb' }) as any);
  app.use(urlencoded({ extended: true, limit: '64mb' }) as any);

  // 只允许本机回环地址跨域访问。
  // 原来的 origin: true 会把任何来源都原样放行，配合 credentials 等于让任意网页
  // 都能读写本机数据库；桌面端前后端本来就同源，不需要放开。
  // 注意：端口现在是启动时随机分配的，这里不能再写死 17890（写了就等于没放行），
  // 所以改为「校验来源是否本机回环 + 任意端口」。
  const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 没有 Origin 头 = 同源请求 / curl / 主进程内部调用，直接放行
      if (!origin) return callback(null, true);
      callback(null, LOOPBACK_ORIGIN.test(origin));
    },
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
