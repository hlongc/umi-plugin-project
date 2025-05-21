/**
 * WebP 图片转换插件
 * 该插件用于将项目中的 JPG、JPEG、PNG 图片转换为 WebP 格式
 * WebP 格式通常提供更好的压缩效果，能够减小图片体积，加快网页加载速度
 */

// 导入需要的 Node.js 核心模块和第三方库
import type { IApi } from '@umijs/max'; // 导入 Umi 的 API 类型定义
import fs from 'fs'; // 文件系统模块，用于读写文件
import glob from 'glob'; // 文件匹配模块，用于查找符合条件的文件
import path from 'path'; // 路径处理模块，用于处理文件路径
import sharp from 'sharp'; // 图片处理库，用于转换图片格式
import { processCssFiles } from './css-processor'; // 导入CSS处理器

// 定义配置选项接口
interface WebpConverterConfig {
  quality?: number; // 图片质量，范围 0-100
  lossless?: boolean; // 是否使用无损压缩
  onlySmallerFiles?: boolean; // 是否只保留比原文件小的 WebP
  minQuality?: number; // 当 WebP 文件比原文件大时，尝试降低质量的最低限制
  processCss?: boolean; // 是否处理CSS文件中的图片URL
}

// 格式化文件大小为人类可读的格式
function formatSize(bytes: number): string {
  // 如果小于1KB，显示为字节
  if (bytes < 1024) return bytes + ' B';

  // 如果小于1MB，显示为KB
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';

  // 否则显示为MB
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 导出插件主函数，该函数接收 api 参数，这是 Umi 提供的插件 API 接口
export default function (api: IApi) {
  // 注册插件，设置插件名称和配置项验证规则
  api.describe({
    key: 'webpConverter', // 插件的唯一标识，也是配置项在 .umirc.ts 中的键名
    config: {
      // 定义配置项的数据类型和默认值
      schema(joi) {
        return joi.object({
          // 图片质量，范围 0-100，值越高质量越好，但文件越大
          quality: joi.number().default(85),

          // 是否使用无损压缩，true 为无损（保留所有细节但文件较大），false 为有损（可能损失细节但文件更小）
          lossless: joi.boolean().default(false),

          // 是否只保留比原文件小的 WebP 图片，true 表示只有当 WebP 比原图小时才保留
          onlySmallerFiles: joi.boolean().default(true),

          // 当 WebP 文件比原文件大时，尝试降低质量的最低限制
          minQuality: joi.number().default(70),

          // 是否处理CSS文件中的图片URL
          processCss: joi.boolean().default(true),
        });
      },
    },
  });

  // 从 .umirc.ts 中获取用户配置，如果没有配置则使用默认值
  const config: WebpConverterConfig = api.userConfig.webpConverter || {};

  // 设置图片质量，范围 0-100
  const quality = config.quality || 85;

  // 是否使用无损压缩
  const lossless = config.lossless || false;

  // 是否只保留比原文件小的 WebP 文件，默认为 true
  const onlySmallerFiles = config.onlySmallerFiles !== false;

  // 最低允许的图片质量，用于动态调整时
  const minQuality = config.minQuality || 70;

  // 是否处理CSS文件中的图片URL，默认为 true
  const processCss = config.processCss !== false;

  // 注册构建完成后的钩子函数，在项目构建完成后执行 WebP 转换
  api.onBuildComplete(({ err }: { err?: Error }) => {
    // 如果构建过程中出现错误，不执行转换
    if (err || process.env.NODE_ENV !== 'production') {
      return;
    }

    console.log('开始处理图片转换为 WebP...');

    // 获取输出目录的绝对路径（通常是 dist 目录）
    const distDir = api.paths.absOutputPath;

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

          const webpPath = `${imagePath.replace(/\.(jpg|jpeg|png)$/, '.webp')}`;

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
  });
}
