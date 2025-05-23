/**
 * webpack-import-loader.ts
 * 用于捕获和处理 JavaScript 和 TypeScript 文件中的图片导入语句
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { LoaderContext } from 'webpack';
import { formatSize } from './common';

/**
 * 图片文件扩展名模式
 * 匹配 .jpg, .jpeg, .png
 */
const IMAGE_EXT_PATTERN = '(?:jpe?g|png)';

/**
 * 图片路径模式（不包含查询参数或哈希）
 * 例如: logo.png, logo.jpg, logo.jpeg
 * 可选地包含 !webp 标记表示不转换为 WebP
 */
const IMAGE_PATH_PATTERN = `\\.${IMAGE_EXT_PATTERN}(?:!webp)?`;

/**
 * 文件级别禁用注释
 * 如果文件顶部包含此注释，则整个文件的图片导入都不会转换为 WebP
 */
const DISABLE_COMMENT_PATTERN = /\/\*\*\s*disabled-webp-convert-plugin\s*\*\//;

interface WebpConverterConfig {
  quality?: number; // 图片质量，范围 0-100
  lossless?: boolean; // 是否使用无损压缩
  onlySmallerFiles?: boolean; // 是否只保留比原文件小的 WebP
  minQuality?: number; // 当 WebP 文件比原文件大时，尝试降低质量的最低限制
  processedImagePaths?: Set<string>; // 已处理过的图片路径缓存
}
/**
 * 导入模式类型
 */
interface ImportPattern {
  regex: RegExp;
  type: 'import' | 'require';
  quoteType: 'single' | 'double';
}

/**
 * 文件信息类型
 */
interface FileInfo {
  path: string;
  ext: string;
  isImage: boolean;
}

/**
 * 导入信息类型
 */
interface ImportInfo {
  type: 'import' | 'require';
  quoteType: 'single' | 'double';
  variableName: string;
  path: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
  fileInfo: FileInfo;
  imagePath?: string;
  resolveError?: string;
  skipWebpConversion?: boolean; // 新增: 标记是否跳过 WebP 转换
}

/**
 * 处理导入的结果类型
 */
interface ProcessImportResult {
  newPath?: string;
  [key: string]: any;
}

/**
 * 导入语句的正则表达式
 */
const importPatterns: ImportPattern[] = [
  // import logo from '@/assets/logo.png'; - 单引号版本
  {
    regex: new RegExp(
      `import\\s+([^\\s]+)\\s+from\\s+['](([^']+)${IMAGE_PATH_PATTERN})[']`,
      'g',
    ),
    type: 'import',
    quoteType: 'single',
  },

  // import logo1 from "@/assets/logo.png"; - 双引号版本
  {
    regex: new RegExp(
      `import\\s+([^\\s]+)\\s+from\\s+["](([^"]+)${IMAGE_PATH_PATTERN})["]`,
      'g',
    ),
    type: 'import',
    quoteType: 'double',
  },

  // const logo2 = require('@/assets/logo.png'); - 单引号版本
  {
    regex: new RegExp(
      `const\\s+([^\\s=]+)\\s*=\\s*require\\s*\\(\\s*['](([^']+)${IMAGE_PATH_PATTERN})[']\\s*\\)`,
      'g',
    ),
    type: 'require',
    quoteType: 'single',
  },

  // const logo3 = require("@/assets/logo.png"); - 双引号版本
  {
    regex: new RegExp(
      `const\\s+([^\\s=]+)\\s*=\\s*require\\s*\\(\\s*["](([^"]+)${IMAGE_PATH_PATTERN})["]\\s*\\)`,
      'g',
    ),
    type: 'require',
    quoteType: 'double',
  },
];

/**
 * Loader 选项类型
 */
interface LoaderOptions {
  debug?: boolean;
  emitMetadata?: boolean;
  processImport?: (
    importInfo: ImportInfo,
    context: { resourcePath: string; rootContext: string },
  ) => ProcessImportResult | null;
  [key: string]: any;
}

/**
 * 提取文件的基本信息
 * @param {string} filePath - 文件路径
 * @returns {FileInfo} 包含文件基本信息的对象
 */
function extractFileInfo(filePath: string): FileInfo {
  // 获取扩展名
  const extMatch = filePath.match(/\.([^.]+)(?:!webp)?$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  return {
    path: filePath,
    ext,
    isImage: /^jpe?g$|^png$/.test(ext),
  };
}

/**
 * 解析导入路径为真实文件路径
 * @param {LoaderContext<LoaderOptions>} loaderContext - webpack loader 上下文
 * @param {string} importPath - 导入路径 (如 '@/assets/logo.png')
 * @param {string} contextPath - 当前文件路径
 * @returns {Promise<string>} 解析后的真实文件路径
 */
function resolveImportPath(
  loaderContext: LoaderContext<LoaderOptions>,
  importPath: string,
  contextPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 使用 webpack 的 resolve 方法解析路径
    loaderContext.resolve(
      // 当前文件所在目录作为上下文
      contextPath.substring(0, contextPath.lastIndexOf('/')),
      // 要解析的导入路径
      importPath,
      (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result as string);
        }
      },
    );
  });
}

/**
 * Webpack loader 用于捕获图片导入语句
 * @param {string} source - 源代码
 */
export default function loader(
  this: LoaderContext<LoaderOptions>,
  source: string,
): void {
  // 启用 loader 的异步模式
  const callback = this.async();
  if (!callback) {
    throw new Error('Webpack Import Loader 需要异步模式');
  }

  // 获取 webpack loader 上下文
  const { resourcePath } = this;

  // 获取当前环境
  const isProduction = process.env.NODE_ENV === 'production';

  // 只在开发模式下处理 !webp 标记，或在生产模式下进行完整处理
  const shouldOnlyRemoveWebpMark = !isProduction;

  // 只处理 js、jsx、ts、tsx 文件，排除 node_modules 中的文件
  if (
    !/\.(js|jsx|ts|tsx)$/.test(resourcePath) ||
    /node_modules/.test(resourcePath)
  ) {
    return callback(null, source);
  }

  // 如果是开发模式，只需要移除 !webp 标记
  if (shouldOnlyRemoveWebpMark) {
    // 使用正则表达式查找所有带有 !webp 标记的图片导入
    let modifiedSource = source;
    let hasModifications = false;

    for (const pattern of importPatterns) {
      let match: RegExpExecArray | null;
      pattern.regex.lastIndex = 0;

      while ((match = pattern.regex.exec(source)) !== null) {
        const importPath = match[2];
        // 检查是否有 !webp 标记
        if (importPath.endsWith('!webp')) {
          // 移除 !webp 标记
          const newPath = importPath.replace(/!webp$/, '');
          const newFullMatch = match[0].replace(importPath, newPath);
          modifiedSource = modifiedSource.replace(match[0], newFullMatch);
          hasModifications = true;
        }
      }
    }

    if (hasModifications) {
      console.log(
        `[webpack-import-loader] 开发模式: 在 ${resourcePath} 中移除了 !webp 标记`,
      );
    }

    // 返回可能修改过的源代码
    return callback(null, modifiedSource);
  }

  // 以下是生产模式的完整处理逻辑

  // 检查文件是否包含禁用注释
  const isFileDisabled = DISABLE_COMMENT_PATTERN.test(source.slice(0, 500)); // 只检查文件前500个字符

  if (isFileDisabled) {
    console.log(
      `[webpack-import-loader] 文件 ${resourcePath} 已通过顶部注释禁用 WebP 转换`,
    );
  }

  // 获取 loader 选项
  const options = (this.getOptions() || {}) as WebpConverterConfig;

  // 设置图片质量，范围 0-100
  const quality = options.quality || 85;

  // 是否使用无损压缩
  const lossless = options.lossless || false;

  // 是否只保留比原文件小的 WebP 文件，默认为 true
  const onlySmallerFiles = options.onlySmallerFiles;

  // 最低允许的图片质量，用于动态调整时
  const minQuality = options.minQuality || 70;

  // 已处理过的图片路径缓存
  const processedImagePaths = options.processedImagePaths || new Set<string>();

  // 把临时创建的webp文件添加到临时文件列表中，在webpack-import-webp-plugin中使用，在编译结束时删除
  const addTmpWebpFile = (this._compilation as any).webpLoaderContext
    ?.addTmpWebpFile as (filePath: string) => void;

  // 记录找到的所有导入
  let imports: ImportInfo[] = [];
  let modifiedSource = source;

  // 使用正则表达式查找所有匹配的导入语句
  const processImports = async (): Promise<void> => {
    for (const pattern of importPatterns) {
      let match: RegExpExecArray | null;

      // 重置正则表达式的 lastIndex
      pattern.regex.lastIndex = 0;

      while ((match = pattern.regex.exec(source)) !== null) {
        /** 是否替换为了webp路径 */
        let rewritePath = false;
        const importPath = match[2];

        // 检查是否有 !webp 标记
        const hasSkipWebpMark = importPath.endsWith('!webp');
        // 获取不带 !webp 标记的路径
        const cleanPath = hasSkipWebpMark
          ? importPath.replace(/!webp$/, '')
          : importPath;

        // 创建导入信息对象
        const importInfo: ImportInfo = {
          type: pattern.type,
          quoteType: pattern.quoteType,
          variableName: match[1],
          path: importPath,
          fullMatch: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          fileInfo: extractFileInfo(importPath),
          // 如果文件被禁用或导入路径有标记，则跳过转换
          skipWebpConversion: isFileDisabled || hasSkipWebpMark,
        };

        try {
          // 解析文件的真实路径 - 使用不带标记的路径
          const imagePath = await resolveImportPath(
            this,
            cleanPath, // 使用清理后的路径
            resourcePath,
          );
          importInfo.imagePath = imagePath;

          // 检查是否已经处理过该图片
          if (processedImagePaths.has(imagePath)) {
            console.log(`已处理过: ${cleanPath} -> ${imagePath}，跳过重复处理`);

            // 如果WebP文件存在，且不是标记为跳过转换的，仍然需要替换路径
            if (!importInfo.skipWebpConversion) {
              const webpPath = `${imagePath.replace(
                /\.(jpg|jpeg|png)$/,
                '.webp',
              )}`;
              if (fs.existsSync(webpPath)) {
                rewritePath = true;
              }
            }

            // 继续处理下一个导入
            continue;
          }

          console.log(`解析路径成功: ${cleanPath} -> ${imagePath}`);

          // 如果图片存在，且不是标记为跳过转换的，那就尝试转换为webp格式
          if (fs.existsSync(imagePath) && !importInfo.skipWebpConversion) {
            // 将图片路径添加到已处理缓存中
            processedImagePaths.add(imagePath);

            // 读取原始图片文件到内存
            const imageBuffer = fs.readFileSync(imagePath);
            // 获取原始图片文件大小（字节）
            const originalSize = imageBuffer.length;
            // 第一步：使用配置的质量参数进行 WebP 转换
            let webpBuffer = await sharp(imageBuffer)
              .webp({
                quality, // 使用配置的质量值
                lossless, // 是否无损
              })
              .toBuffer(); // 输出为缓冲区而不是文件

            // 获取转换后的 WebP 图片大小
            let webpSize = webpBuffer.length;

            // 如果 WebP 图片比原图大，并且是有损模式，尝试降低质量来减小体积
            if (webpSize >= originalSize && !lossless && quality > minQuality) {
              // 逐步降低质量尝试减小文件体积
              let currentQuality = quality - 5; // 从当前质量减5开始

              // 循环尝试不同的质量，直到找到一个合适的或达到最低质量限制
              while (webpSize >= originalSize && currentQuality >= minQuality) {
                // 用较低的质量重新转换
                webpBuffer = await sharp(imageBuffer)
                  .webp({
                    quality: currentQuality, // 使用逐步降低的质量
                    lossless: false, // 强制使用有损
                  })
                  .toBuffer();

                // 更新 WebP 大小
                webpSize = webpBuffer.length;

                // 质量再降低5个单位继续尝试
                currentQuality -= 5;
              }
            }

            // 判断是否保存 WebP 文件：
            // 1. WebP 比原图小，或者
            // 2. 配置了不仅保留小文件（onlySmallerFiles 为 false）
            if (webpSize < originalSize || !onlySmallerFiles) {
              // 构建 WebP 文件路径，与原文件同目录，文件名替换为 .webp 后缀

              const webpPath = `${imagePath.replace(
                /\.(jpg|jpeg|png)$/,
                '.webp',
              )}`;

              // 将 WebP 图片写入到文件系统
              fs.writeFileSync(webpPath, webpBuffer);

              // 将WebP文件路径添加到临时文件数组中
              addTmpWebpFile?.(webpPath);

              rewritePath = true;
              // 根据结果更新统计信息并输出日志
              if (webpSize < originalSize) {
                // 输出转换成功的日志，包含节省比例和大小信息
                console.log(
                  `已转换: ${path.basename(imagePath)} -> ${path.basename(
                    webpPath,
                  )} `,
                );
              } else {
                // WebP 比原图大但配置了保留的情况
                console.log(
                  `已转换: ${path.basename(imagePath)} -> ${path.basename(
                    webpPath,
                  )} ` +
                    `(体积更大: 从 ${formatSize(
                      originalSize,
                    )} 增加到 ${formatSize(webpSize)})`,
                );
              }
            } else {
              // WebP 比原图大并且配置了只保留小文件的情况

              // 输出跳过的日志
              console.log(
                `跳过: ${path.basename(imagePath)} (WebP体积更大: ${formatSize(
                  webpSize,
                )} > ${formatSize(originalSize)})`,
              );
            }
          } else if (importInfo.skipWebpConversion) {
            let skipReason = '';
            if (isFileDisabled) {
              skipReason = '文件顶部禁用注释';
            } else if (hasSkipWebpMark) {
              skipReason = '!webp 标记';
            }

            console.log(
              `跳过转换: ${path.basename(
                imagePath,
              )} (用户通过${skipReason}指定不转换)`,
            );
          }

          // 如果需要，可以在这里读取文件内容
          // importInfo.fileContent = await readFile(imagePath);
        } catch (error) {
          console.error(`解析路径失败: ${importPath}`, error);
          if (error instanceof Error) {
            importInfo.resolveError = error.message;
          } else {
            importInfo.resolveError = String(error);
          }
        }

        imports.push(importInfo);

        // 如果有 !webp 标记，移除标记
        if (hasSkipWebpMark) {
          const newPath = importInfo.path.replace(/!webp$/, '');
          const newFullMatch = importInfo.fullMatch.replace(
            importInfo.path,
            newPath,
          );
          modifiedSource = modifiedSource.replace(
            importInfo.fullMatch,
            newFullMatch,
          );
        }
        // 如果需要替换为 webp 路径
        else if (rewritePath) {
          const newPath = importInfo.path.replace(/\.(jpg|jpeg|png)$/, '.webp');
          const newFullMatch = importInfo.fullMatch.replace(
            importInfo.path,
            newPath,
          );
          modifiedSource = modifiedSource.replace(
            importInfo.fullMatch,
            newFullMatch,
          );
        }
      }
    }
    // imports根据fullMatch字段进行去重
    imports = imports.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.fullMatch === item.fullMatch),
    );
    // 如果找到导入，记录它们
    if (imports.length > 0) {
      console.log(
        `[webpack-import-loader] 在 ${resourcePath} 中找到 ${imports.length} 个图片导入:`,
      );
      imports.forEach((imp) => {
        console.log(
          `- ${imp.type} (${imp.quoteType}引号): ${imp.variableName} 从 ${imp.path} 导入`,
        );
        if (imp.imagePath) {
          console.log(`  真实路径: ${imp.imagePath}`);
        }
        if (imp.skipWebpConversion) {
          console.log(`  已标记为不转换为 WebP`);
        }
      });
    }

    // 可以将找到的导入信息添加到模块的元数据中
    // if (options.emitMetadata && this._module) {
    //   // @ts-ignore: 强制访问私有属性
    //   this._module.buildInfo = this._module.buildInfo || {};
    //   // @ts-ignore: 强制访问私有属性
    //   this._module.buildInfo.imageImports = imports;
    // }

    // 返回可能修改过的源代码
    callback(null, modifiedSource);
  };

  // 执行异步处理
  processImports().catch((err) => {
    console.error('处理导入时出错:', err);
    callback(err);
  });
}

// 确保 webpack 知道这个 loader 是一个纯函数
// @ts-ignore
loader.raw = false;
