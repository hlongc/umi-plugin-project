/**
 * HTML注入器
 * 用于将WebP检测脚本注入到HTML页面中
 */

import fs from 'fs';
import glob from 'glob';
import path from 'path';

/**
 * 将WebP检测脚本注入到HTML页面中
 * @param outputPath 输出目录路径
 */
export function injectWebPDetector(outputPath: string): void {
  console.log('开始将WebP检测脚本注入到HTML页面中...');

  // 读取WebP检测脚本
  const scriptPath = path.join(__dirname, 'webp-detector.js');
  let scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  // 将脚本内容包装在<script>标签中
  const scriptTag = `<script>\n${scriptContent}\n</script>`;

  // 查找所有HTML文件
  const htmlFiles = glob.sync(path.join(outputPath, '**/*.html'));
  let processedFiles = 0;

  // 处理每个HTML文件
  htmlFiles.forEach((htmlFilePath) => {
    try {
      // 读取HTML文件内容
      let htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

      // 检查是否已经注入了WebP检测脚本
      if (
        htmlContent.includes('--webp-support') ||
        htmlContent.includes('detectWebP')
      ) {
        console.log(`跳过 ${htmlFilePath} - 已包含WebP检测脚本`);
        return;
      }

      // 在</head>标签前注入脚本
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `${scriptTag}\n</head>`);
      }
      // 如果没有</head>标签，在<body>标签后注入
      else if (htmlContent.includes('<body>')) {
        htmlContent = htmlContent.replace('<body>', `<body>\n${scriptTag}`);
      }
      // 如果都没有，在文件开头注入
      else {
        htmlContent = `${scriptTag}\n${htmlContent}`;
      }

      // 写回文件
      fs.writeFileSync(htmlFilePath, htmlContent);
      processedFiles++;
    } catch (error) {
      console.error(`注入WebP检测脚本失败 ${htmlFilePath}:`, error);
    }
  });

  console.log(`WebP检测脚本注入完成，共处理 ${processedFiles} 个HTML文件`);
}
