/**
 * 本地替身：@lark-apaas/client-toolkit/logger
 * 平台版会把日志上报到平台控制台，本地只需要输出到浏览器控制台。
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, args: unknown[]) {
  const fn = (console[level] || console.log).bind(console);
  fn('[app]', ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};

export default logger;
