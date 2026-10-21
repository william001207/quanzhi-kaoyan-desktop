/**
 * Tailwind 4 的主题色/字体全部定义在 src/tailwind-theme.css 的 @theme 块里，
 * 这里只需要告诉它扫描哪些文件。原平台的 preset 已不再使用。
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
