/**
 * 本地替身：@lark-apaas/client-toolkit 的 showConfirm
 * 命令式调用的确认框，返回用户是否点了“确定”。
 * 用浏览器原生 confirm 实现：无框架依赖、在任何调用位置都可用。
 */
export async function showConfirm(message: string): Promise<boolean> {
  return window.confirm(message);
}

export default showConfirm;
