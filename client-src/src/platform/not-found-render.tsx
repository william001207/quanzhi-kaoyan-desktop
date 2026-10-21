/**
 * 本地替身：@lark-apaas/client-toolkit/components/NotFoundRender
 */
import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundRender() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的页面可能已被移除或地址有误</p>
      <Link to="/" className="text-sm underline">
        返回首页
      </Link>
    </div>
  );
}

export default NotFoundRender;
