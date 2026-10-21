import { NavLink, Outlet } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  BarChart3,
  XCircle,
  LayoutDashboard,
  Settings,
  ListTree,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Upload,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import * as api from '@/api';
import type { KnowledgePointBrief, Chapter, SyllabusItem, SearchQuestion, UserSetting, SearchResult } from '@shared/api.interface';
import { useNavigate } from 'react-router-dom';
import { daysUntil } from '@/utils/mastery';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { cn } from '@/lib/utils';
import { Image } from '@client/src/components/ui/image';
import logoSrc from '@/assets/logo.png';

const JinRiIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontSize="14"
      fontWeight="600"
      fill="currentColor"
      stroke="none"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      今
    </text>
  </svg>
);

const ExamIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontSize="14"
      fontWeight="600"
      fill="currentColor"
      stroke="none"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      真
    </text>
  </svg>
);

const routePrefetchMap: Record<string, () => Promise<unknown>> = {
  '/syllabus': () => import('@/pages/syllabus/SyllabusPage'),
  '/review-queue': () => import('@/pages/review-queue/ReviewQueuePage'),
  '/knowledge-points': () => import('@/pages/knowledge-points/KnowledgePointsPage'),
  '/questions': () => import('@/pages/questions/QuestionsPage'),
  '/mock-exam': () => import('@/pages/mock-exam/MockExamIndexPage'),
  '/wrong-questions': () => import('@/pages/wrong-questions/WrongQuestionsPage'),
  '/dashboard': () => import('@/pages/dashboard/DashboardPage'),
  '/settings': () => import('@/pages/settings/SettingsPage'),
};

const prefetchedRoutes = new Set<string>();

export function prefetchRoute(path: string): void {
  const loader = routePrefetchMap[path];
  if (!loader || prefetchedRoutes.has(path)) return;
  prefetchedRoutes.add(path);
  loader().catch(() => {
    prefetchedRoutes.delete(path);
  });
}

export function prefetchMainRoutes(): void {
  if (typeof window === 'undefined') return;
  const mainRoutes = ['/syllabus', '/knowledge-points', '/questions', '/review-queue'];
  const schedule = (cb: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(cb, { timeout: 2000 });
    } else {
      setTimeout(cb, 1000);
    }
  };
  schedule(() => {
    mainRoutes.forEach((route: string, i: number) => {
      setTimeout(() => prefetchRoute(route), i * 100);
    });
  });
}

const navItems = [
  { path: '/', label: '今日学习', icon: JinRiIcon, end: true },
  { path: '/syllabus', label: '大纲地图', icon: ListTree },
  { path: '/review-queue', label: '复习队列', icon: Calendar },
  { path: '/knowledge-points', label: '知识点中心', icon: LayoutDashboard },
  { path: '/questions', label: '真题中心', icon: ExamIcon },
  { path: '/mock-exam', label: '模拟考试', icon: FileText },
  { path: '/wrong-questions', label: '错题本', icon: XCircle },
  { path: '/dashboard', label: '数据看板', icon: BarChart3 },
  { path: '/import', label: '数据导入', icon: Upload },
  { path: '/settings', label: '设置', icon: Settings },
];

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [settings, setSettings] = useState<UserSetting | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await api.settings.get();
        setSettings(result);
      } catch {
        // ignore
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResult(null);
      setSearchError(false);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.search.globalSearch(
          searchQuery,
          controller.signal,
        );
        setSearchResult(result);
        setSearchError(false);
      } catch (err) {
        if ((err as { code?: string })?.code === 'ERR_CANCELED') return;
        logger.error('全局搜索失败', err);
        setSearchResult(null);
        setSearchError(true);
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 桌面端侧边栏 */}
      <aside
        className={`hidden md:flex flex-col border-r bg-muted/30 transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'w-14' : 'w-60'
        }`}
      >
        <div
          className={`flex h-14 items-center border-b ${
            sidebarCollapsed ? 'justify-center px-0' : 'px-4'
          }`}
        >
          {sidebarCollapsed ? (
            <Image src={logoSrc} alt="全职高手考研" className="h-7 w-7 rounded-md" />
          ) : (
            <div className="flex items-center gap-2">
              <Image src={logoSrc} alt="" className="h-7 w-7 rounded-md" />
              <span className="text-base font-semibold">全职高手考研</span>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                title={sidebarCollapsed ? item.label : undefined}
                onMouseEnter={() => prefetchRoute(item.path)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md py-2 text-sm transition-colors ${
                    sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  }`
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={`w-full ${
              sidebarCollapsed ? 'justify-center px-0' : 'justify-start'
            }`}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="text-xs">收起</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* 移动端抽屉式侧边栏 */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col border-r bg-background shadow-xl animate-in slide-in-from-left">
            <div className="flex h-14 items-center justify-between px-4 border-b">
              <div className="flex items-center gap-2">
                <Image src={logoSrc} alt="" className="h-7 w-7 rounded-md" />
                <span className="text-base font-semibold">全职高手考研</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md py-2.5 px-3 text-sm transition-colors ${
                        isActive
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-2 md:gap-4 border-b bg-background px-3 md:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">{today}</div>
            <ExamCountdownBadge settings={settings} />
            <div className="ml-auto flex items-center gap-2 md:gap-4">
            <div ref={searchContainerRef} className="relative w-40 sm:w-56 md:w-72">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索知识点、真题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  className="pl-8 h-9 text-sm bg-background"
                />
              </div>
              {searchOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden">
                  <Command className="rounded-none">
                    <CommandList className="max-h-[360px]">
                      <CommandEmpty>
                        {searchError
                          ? '搜索失败，请稍后重试'
                          : searchLoading
                          ? '搜索中...'
                          : searchQuery.trim().length >= 2
                          ? '没有找到相关结果'
                          : '输入关键词搜索'}
                      </CommandEmpty>
                      {searchResult?.knowledgePoints?.length ? (
                        <CommandGroup heading="知识点">
                          {searchResult.knowledgePoints.slice(0, 6).map((kp) => (
                            <CommandItem
                              key={kp.id}
                              onSelect={() => {
                                navigate(`/knowledge-points/${kp.id}`);
                                setSearchOpen(false);
                                setSearchQuery('');
                              }}
                              className="flex flex-col items-start gap-1 py-2"
                            >
                              <span className="truncate w-full">{kp.title}</span>
                              <ChapterPathBadges chapterPaths={kp.chapterPaths} size="xs" />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {searchResult?.examChapters?.length ? (
                        <CommandGroup heading="考纲章节">
                          {searchResult.examChapters.slice(0, 5).map((ch) => (
                            <CommandItem
                              key={ch.id}
                              onSelect={() => {
                                navigate(`/syllabus?chapter=${ch.id}`);
                                setSearchOpen(false);
                                setSearchQuery('');
                              }}
                              className="text-sm"
                            >
                              {ch.title}
                              <span className="ml-2 text-xs text-muted-foreground">L{ch.level}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {searchResult?.textbookChapters?.length ? (
                        <CommandGroup heading="教材章节">
                          {searchResult.textbookChapters.slice(0, 5).map((ch) => (
                            <CommandItem
                              key={ch.id}
                              onSelect={() => {
                                navigate(`/syllabus?chapter=${ch.id}`);
                                setSearchOpen(false);
                                setSearchQuery('');
                              }}
                              className="text-sm"
                            >
                              {ch.title}
                              <span className="ml-2 text-xs text-muted-foreground">L{ch.level}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {searchResult?.questions?.length ? (
                        <CommandGroup heading="真题">
                          {searchResult.questions.slice(0, 5).map((q) => (
                            <CommandItem
                              key={q.id}
                              onSelect={() => {
                                navigate(`/questions?q=${encodeURIComponent(q.questionText.slice(0, 20))}`);
                                setSearchOpen(false);
                                setSearchQuery('');
                              }}
                            >
                              <span className="text-xs text-muted-foreground mr-2">[{q.year}]</span>
                              <span className="truncate">{q.questionText.slice(0, 40)}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {(searchResult && (searchResult.knowledgePoints?.length > 6 || searchResult.questions?.length > 5 || searchResult.examChapters?.length > 5 || searchResult.textbookChapters?.length > 5)) && (
                        <div className="border-t px-2 py-2">
                          <button
                            type="button"
                            className="w-full text-left text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
                              setSearchOpen(false);
                            }}
                          >
                            查看全部结果
                          </button>
                        </div>
                      )}
                    </CommandList>
                  </Command>
                </div>
              )}
            </div>
            </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
};

const ExamCountdownBadge: React.FC<{ settings: UserSetting | null }> = ({ settings }) => {
  const navigate = useNavigate();
  const days = daysUntil(settings?.examDate ?? null);

  if (settings === null) {
    return (
      <div className="text-xs text-muted-foreground/60">加载中...</div>
    );
  }

  if (days === null) {
    return (
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
      >
        未设置考试日期
      </button>
    );
  }

  if (days > 30) {
    return (
      <div className="text-xs text-muted-foreground">
        距考试 <span className="font-semibold text-foreground">{days}</span> 天
      </div>
    );
  }

  if (days > 0) {
    return (
      <div className="text-xs text-muted-foreground">
        距考试 <span className="font-bold text-red-600">{days}</span> 天
      </div>
    );
  }

  if (days === 0) {
    return (
      <div className="text-xs font-medium text-red-600">考试进行中</div>
    );
  }

  return (
    <div className="text-xs font-medium text-red-600">考试已结束</div>
  );
};

export default Layout;
