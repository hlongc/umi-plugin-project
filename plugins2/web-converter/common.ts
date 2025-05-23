// 格式化文件大小为人类可读的格式
export function formatSize(bytes: number): string {
  // 如果小于1KB，显示为字节
  if (bytes < 1024) return bytes + ' B';

  // 如果小于1MB，显示为KB
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';

  // 否则显示为MB
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
