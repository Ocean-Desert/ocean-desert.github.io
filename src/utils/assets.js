/**
 * 获取资源路径（使用 @ 别名）
 * @param {string} path - 资源路径，相对于 src 目录，例如 '@/assets/images/1.jpg'
 * @returns {string} 资源的完整 URL
 */
export function getAssetUrl(path) {
  // 移除开头的 @/ 或 @，因为 new URL 需要相对路径
  const relativePath = path.replace(/^@\/?/, '')
  return new URL(`../${relativePath}`, import.meta.url).href
}

/**
 * 批量获取资源路径
 * @param {string[]} paths - 资源路径数组
 * @returns {string[]} 资源 URL 数组
 */
export function getAssetUrls(paths) {
  return paths.map(path => getAssetUrl(path))
}

