export interface WebpConverterConfig {
  /** 图片质量，范围 0-100， 默认 85 */
  quality?: number;
  /** 是否使用无损压缩， 默认 false */
  lossless?: boolean;
  /** 是否只保留比原文件小的 WebP， 默认 true */
  onlySmallerFiles?: boolean;
  /** 当 WebP 文件比原文件大时，尝试降低质量的最低限制， 默认 70 */
  minQuality?: number;
  /** 是否处理CSS文件中的图片URL， 默认 true */
  processCss?: boolean;
  /** 是否处理import语句 */
  processImport?: boolean;
}

/**
 * 文件信息类型
 */
export interface FileInfo {
  path: string;
  ext: string;
  isImage: boolean;
}
