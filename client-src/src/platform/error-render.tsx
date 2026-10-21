/**
 * 本地替身：@lark-apaas/client-toolkit/components/ErrorRender
 */
import React from 'react';

interface Props {
  error: Error;
  resetErrorBoundary?: () => void;
}

export function ErrorRender({ error, resetErrorBoundary }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">页面出错了</h1>
      <p className="max-w-xl whitespace-pre-wrap break-all text-sm text-muted-foreground">
        {error?.message || '未知错误'}
      </p>
      {resetErrorBoundary && (
        <button
          onClick={resetErrorBoundary}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          重试
        </button>
      )}
    </div>
  );
}

export default ErrorRender;
