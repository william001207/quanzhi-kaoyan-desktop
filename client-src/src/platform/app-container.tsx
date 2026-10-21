/**
 * 本地替身：@lark-apaas/client-toolkit/components/AppContainer
 * 平台版提供主题、字体、全局 context 等外壳；本地只需主题 Provider + 基础容器。
 */
import React from 'react';
import { ThemeProvider } from 'next-themes';

interface Props {
  children: React.ReactNode;
  defaultTheme?: string;
}

export function AppContainer({ children, defaultTheme = 'light' }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem={false}>
      <div className="min-h-screen bg-background text-foreground">{children}</div>
    </ThemeProvider>
  );
}

export default AppContainer;
