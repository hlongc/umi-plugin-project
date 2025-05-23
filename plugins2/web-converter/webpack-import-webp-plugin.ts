import fs from 'fs';
import glob from 'glob'; // 文件匹配模块，用于查找符合条件的文件
import path from 'path';
import sharp from 'sharp'; // 图片处理库，用于转换图片格式
import type { Compiler, RuleSetRule } from 'webpack';
import { formatSize } from './common';
import { processCssFiles } from './css-processor'; // 导入CSS处理器

interface WebpConverterConfig {
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
}

/**
 * 文件信息类型
 */
interface FileInfo {
  path: string;
  ext: string;
  isImage: boolean;
}

class WebpackImportWebpPlugin {
  private options: WebpConverterConfig = {
    quality: 85,
    lossless: false,
    onlySmallerFiles: true,
    minQuality: 70,
    processCss: true,
  };
  /** 临时写入的文件路径，编译完成以后要删除 */
  private tempWebpFiles: string[] = [];
  /** 已处理过的图片路径缓存 */
  private processedImagePaths: Set<string> = new Set();

  constructor(options: WebpConverterConfig) {
    this.options = { ...this.options, ...options };
  }

  extractFileInfo(filePath: string): FileInfo {
    // 获取扩展名
    const extMatch = filePath.match(/\.([^.]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';

    return {
      path: filePath,
      ext,
      isImage: /^jpe?g$|^png$/.test(ext),
    };
  }

  apply(compiler: Compiler) {
    console.log('插件apply');

    const tempWebpFiles = this.tempWebpFiles;
    const processedImagePaths = this.processedImagePaths;

    // 注册loader，用于处理图片导入
    const webpLoaderRule: RuleSetRule = {
      test: /\.(js|jsx|ts|tsx)$/,
      // 排除 node_modules 文件夹，避免处理不必要的文件
      exclude: /node_modules/,
      use: [
        {
          loader: path.resolve(__dirname, './webpack-import-loader.ts'),
          options: {
            ...this.options,
            // 传递已处理图片路径的引用
            processedImagePaths,
          },
        },
      ],
      enforce: 'pre',
    };

    // 添加自定义loader规则
    compiler.hooks.afterEnvironment.tap('WebpackImportWebpPlugin', () => {
      if (compiler.options.module && compiler.options.module.rules) {
        compiler.options.module.rules.push(webpLoaderRule);
      }
    });

    // 创建一个上下文对象，用于在 loader 中共享数据
    const webpLoaderContext = {
      processedImagePaths,
      addTmpWebpFile: (filePath: string) => {
        if (!tempWebpFiles.includes(filePath)) {
          tempWebpFiles.push(filePath);
        }
      },
    };

    compiler.hooks.thisCompilation.tap(
      'WebpackImportWebpPlugin',
      async (compilation) => {
        // 将上下文对象添加到 compilation 中
        (compilation as any).webpLoaderContext = webpLoaderContext;
      },
    );

    if (process.env.NODE_ENV === 'production') {
      // 注册编译完成钩子，清理临时WebP文件
      compiler.hooks.done.tap('WebpackImportWebpPlugin', () => {
        if (tempWebpFiles.length > 0) {
          console.log(
            `[WebP Converter] 正在清理 ${tempWebpFiles.length} 个临时WebP文件...`,
          );
          for (const filePath of tempWebpFiles) {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[WebP Converter] 正在清理 ${filePath}`);
              }
            } catch (err) {
              console.error(`[WebP Converter] 删除文件 ${filePath} 失败:`, err);
            }
          }
          // 清空数组
          tempWebpFiles.length = 0;
          // 清空处理过的路径缓存
          processedImagePaths.clear();
          console.log('[WebP Converter] 临时文件清理完成');
        }

        this.convertToWebp(compiler.options.output.path!);
        // 获取当前的工作目录
        const cwd = process.cwd();
        console.log('当前工作目录', cwd);
      });
    }
  }

  convertToWebp(distDir: string) {
    console.log('开始处理图片转换为 WebP...');

    const {
      quality = 85,
      lossless = false,
      onlySmallerFiles = true,
      minQuality = 70,
      processCss = true,
    } = this.options;

    // 查找所有 jpg、jpeg、png 图片文件
    // glob.sync 会返回所有匹配指定模式的文件路径数组
    const imageFiles = glob.sync(
      path.join(distDir, '{static/**/*.{jpg,jpeg,png},*.{jpg,jpeg,png}}'),
    );

    // 初始化统计数据
    let totalFiles = 0; // 处理的总文件数
    let smallerFiles = 0; // 转换后变小的文件数
    let skippedFiles = 0; // 因为变大而跳过的文件数
    let totalSaved = 0; // 总共节省的空间（字节）

    // 对每个图片文件进行处理，使用 Promise 数组来并行处理多个文件
    const promises = imageFiles.map(async (imagePath: string) => {
      try {
        totalFiles++; // 处理文件总数加1

        // 读取原始图片文件到内存
        const imageBuffer = fs.readFileSync(imagePath);

        // 构建 WebP 文件路径，与原文件同目录，文件名替换为 .webp 后缀

        const webpPath = `${imagePath.replace(/\.(jpg|jpeg|png)$/, '.webp')}`;
        if (fs.existsSync(webpPath)) {
          console.log(`已处理过: ${imagePath} -> ${webpPath}，跳过重复处理`);
          return;
        }

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
          // 将 WebP 图片写入到文件系统
          fs.writeFileSync(webpPath, webpBuffer);

          // 根据结果更新统计信息并输出日志
          if (webpSize < originalSize) {
            // WebP 比原图小的情况
            smallerFiles++; // 成功优化的文件数加1

            // 计算节省的字节数
            const savedSize = originalSize - webpSize;

            // 累计总节省空间
            totalSaved += savedSize;

            // 计算节省的百分比并保留两位小数
            const savingPercent = ((savedSize / originalSize) * 100).toFixed(2);

            // 输出转换成功的日志，包含节省比例和大小信息
            console.log(
              `已转换: ${path.basename(imagePath)} -> ${path.basename(
                webpPath,
              )} ` +
                `(节省: ${savingPercent}%, 从 ${formatSize(
                  originalSize,
                )} 减小到 ${formatSize(webpSize)})`,
            );
          } else {
            // WebP 比原图大但配置了保留的情况
            console.log(
              `已转换: ${path.basename(imagePath)} -> ${path.basename(
                webpPath,
              )} ` +
                `(体积更大: 从 ${formatSize(originalSize)} 增加到 ${formatSize(
                  webpSize,
                )})`,
            );
          }
        } else {
          // WebP 比原图大并且配置了只保留小文件的情况
          skippedFiles++; // 跳过的文件数加1

          // 输出跳过的日志
          console.log(
            `跳过: ${path.basename(imagePath)} (WebP体积更大: ${formatSize(
              webpSize,
            )} > ${formatSize(originalSize)})`,
          );
        }
      } catch (error) {
        // 捕获并输出转换过程中的错误
        console.error(`转换失败 ${imagePath}:`, error);
      }
    });

    // 等待所有转换任务完成
    Promise.all(promises)
      .then(() => {
        // 输出总体统计信息
        console.log('\n--------- WebP 转换统计 ---------');
        console.log(`总文件数: ${totalFiles}`);
        console.log(`成功转换并且体积更小: ${smallerFiles}`);
        console.log(`因为体积更大而跳过: ${skippedFiles}`);
        console.log(`总共节省空间: ${formatSize(totalSaved)}`);
        console.log('WebP 转换完成!');

        // 处理CSS文件中的图片URL
        if (processCss) {
          processCssFiles(distDir);
        }
      })
      .catch((error: Error) => {
        // 捕获并输出整体处理过程中的错误
        console.error('WebP 转换过程中出错:', error);
      });
  }
}

export default WebpackImportWebpPlugin;
