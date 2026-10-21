import React, { Component, Suspense, lazy, useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import { prefetchMainRoutes } from './components/Layout';
import KeepAliveOutlet from './components/KeepAliveOutlet';
import NotFound from './pages/NotFound/NotFound';

import TodayPage from './pages/today/TodayPage';

const SyllabusPage = lazy(() => import('./pages/syllabus/SyllabusPage'));
const ReviewQueuePage = lazy(() => import('./pages/review-queue/ReviewQueuePage'));
const QuestionsPage = lazy(() => import('./pages/questions/QuestionsPage'));
const WrongQuestionsPage = lazy(() => import('./pages/wrong-questions/WrongQuestionsPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const KnowledgePointsPage = lazy(() => import('./pages/knowledge-points/KnowledgePointsPage'));
const KnowledgePointDetailPage = lazy(() => import('./pages/knowledge-points/KnowledgePointDetailPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const ImportPage = lazy(() => import('./pages/import/ImportPage'));
const MockExamIndexPage = lazy(() => import('./pages/mock-exam/MockExamIndexPage'));
const MockExamPage = lazy(() => import('./pages/mock-exam/MockExamPage'));
const MockExamHistoryPage = lazy(() => import('./pages/mock-exam/MockExamHistoryPage'));
const PaperPrintPage = lazy(() => import('./pages/mock-exam/PaperPrintPage'));

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full">
            <div className="text-2xl font-semibold mb-2">页面出现错误</div>
            <div className="text-sm text-muted-foreground mb-4">
              请刷新页面重试。如果问题持续存在，请联系管理员。
            </div>
            <details className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
              <summary className="cursor-pointer select-none">错误详情</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">
                {this.state.error?.message}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageSkeleton = () => (
  <div className="p-6 space-y-4">
    <div className="h-8 w-48 bg-muted rounded animate-pulse" />
    <div className="h-4 w-full bg-muted rounded animate-pulse" />
    <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
    <div className="h-32 bg-muted rounded animate-pulse" />
  </div>
);

const KEEP_ALIVE_PATHS = ['/syllabus', '/questions', '/knowledge-points', '/review-queue'];

const KeepAliveLayout = () => (
  <Layout>
    <KeepAliveOutlet keepPaths={KEEP_ALIVE_PATHS} max={4} />
  </Layout>
);

const RoutesComponent = () => {
  useEffect(() => {
    const timer = setTimeout(() => {
      prefetchMainRoutes();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AppErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route element={<KeepAliveLayout />}>
            <Route index element={<TodayPage />} />
            <Route path="syllabus" element={<SyllabusPage />} />
            <Route path="review-queue" element={<ReviewQueuePage />} />
            <Route path="questions" element={<QuestionsPage />} />
            <Route path="wrong-questions" element={<WrongQuestionsPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="knowledge-points" element={<KnowledgePointsPage />} />
            <Route path="knowledge-points/:id" element={<KnowledgePointDetailPage />} />
            <Route path="high-frequency" element={<Navigate to="/knowledge-points?tab=high-freq" replace />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="mock-exam" element={<MockExamIndexPage />} />
            <Route path="mock-exam/history" element={<MockExamHistoryPage />} />
            <Route path="mock-exam/print/:paperId" element={<PaperPrintPage />} />
            <Route path="mock-exam/:recordId" element={<MockExamPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
};

export default RoutesComponent;
