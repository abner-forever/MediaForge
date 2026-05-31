/**
 * 格式化数字：过万显示为 X.X万，hover 可通过 title 查看原始值。
 * 小于 10000 直接用 toLocaleString 展示。
 */
export function formatCount(n: number): string {
  if (n >= 10000) {
    const w = n / 10000;
    return w >= 100 ? `${Math.round(w)}万` : `${w.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return n.toLocaleString();
}
