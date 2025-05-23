/**
 * WebP 图片转换插件
 * 该插件用于将项目中的 JPG、JPEG、PNG 图片转换为 WebP 格式
 * WebP 格式通常提供更好的压缩效果，能够减小图片体积，加快网页加载速度
 */

// 导入需要的 Node.js 核心模块和第三方库
import type { IApi } from '@umijs/max'; // 导入 Umi 的 API 类型定义
import fs from 'fs';
import path from 'path';
import context from './context';
import { convertToWebp } from './gen-webp';
import { WebpConverterConfig } from './interface';

const defaultCofig: WebpConverterConfig = {
  quality: 85,
  lossless: false,
  onlySmallerFiles: true,
  minQuality: 70,
  processCss: true,
  processImport: true,
};

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

          // 是否处理import语句
          processImport: joi.boolean().default(true),
        });
      },
    },
  });

  // 从 .umirc.ts 中获取用户配置，如果没有配置则使用默认值
  const options: WebpConverterConfig = api.userConfig.webpConverter || {};
  const config = { ...defaultCofig, ...options };
  console.log('config', config);
  const isProduction = process.env.NODE_ENV === 'production';

  if (config.processImport) {
    // 通过webpack-loader处理js、ts中的import require图片语句
    api.modifyWebpackConfig((memo) => {
      memo.module?.rules?.push({
        test: /\.(js|jsx|ts|tsx)$/,
        // 排除 node_modules 文件夹，避免处理不必要的文件
        exclude: /node_modules/,
        use: [
          {
            loader: path.resolve(__dirname, './webpack-import-loader.ts'),
            options: config,
          },
        ],
        enforce: 'pre',
      });

      return memo;
    });
  }

  // 注入检测当前浏览器是否支持webp的脚本
  if (isProduction) {
    api.addHTMLHeadScripts(() =>
      fs.readFileSync(path.resolve(__dirname, './webp-detector.js'), 'utf-8'),
    );
  }

  api.onGenerateFiles(() => {
    // 在插件中追加类型声明
    const typingsPath = path.join(api.paths.absTmpPath, 'typings.d.ts');

    // 文件存在才追加
    if (fs.existsSync(typingsPath)) {
      // 要追加的内容
      const webpTypes = `
// WebP图片类型声明
declare module '*.jpg!webp' {
  const src: string;
  export default src;
}

declare module '*.jpeg!webp' {
  const src: string;
  export default src;
}

declare module '*.png!webp' {
  const src: string;
  export default src;
}
`;

      // 读取现有内容，检查是否已包含WebP类型声明
      const existingContent = fs.readFileSync(typingsPath, 'utf8');
      if (!existingContent.includes('*.jpg!webp')) {
        // 追加内容到文件
        fs.appendFileSync(typingsPath, webpTypes, 'utf8');
        console.log('WebP类型声明已添加到typings.d.ts');
      }
    }
  });
  // 注册构建完成后的钩子函数，在项目构建完成后执行 WebP 转换
  api.onBuildComplete(({ err }: { err?: Error }) => {
    // 如果构建过程中出现错误，不执行转换
    if (err || !isProduction) {
      return;
    }

    // 处理之前创建的临时文件
    context.forEachTempWebpFile(
      (files) => {
        console.log(
          `[WebP Converter] 正在清理 ${files.size} 个临时WebP文件...`,
        );
      },
      (filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[WebP Converter] 正在清理 ${filePath}`);
          }
        } catch (err) {
          console.error(`[WebP Converter] 删除文件 ${filePath} 失败:`, err);
        }
      },
      () => {
        // 清空临时文件
        context.clearTempWebpFiles();
        // 清空处理过的路径缓存
        context.clearProcessedImage();

        console.log('开始处理图片转换为 WebP...');
      },
    );

    // 获取输出目录的绝对路径（通常是 dist 目录）
    const distDir = api.paths.absOutputPath;
    // 把打包以后得图片进行转换
    convertToWebp(distDir, config);
  });
}
