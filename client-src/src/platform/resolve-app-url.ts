/**
 * 本地替身：@lark-apaas/client-toolkit/utils/resolveAppUrl
 * 把应用内的相对路径拼上部署前缀，得到可直接访问的绝对路径。
 */
const BASE = (import.meta as any).env?.BASE_URL || '/';

export function resolveAppUrl(path: string): string {
  if (!path) return BASE;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path; // 已是完整 URL
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}

export default resolveAppUrl;
