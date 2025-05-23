/**
 * CSS图片处理器
 * 用于处理CSS文件中的背景图片，支持WebP格式和回退方案
 */

import fs from 'fs';
import glob from 'glob';
import path from 'path';

// 辅助函数：转义正则表达式中的特殊字符
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 检查是否是多重背景声明
function isMultipleBackground(cssRule: string): boolean {
  // 检测是否包含多个url()函数或者逗号分隔的背景声明
  const urlCount = (cssRule.match(/url\(/g) || []).length;
  if (urlCount > 1) return true;

  // 检测是否有逗号分隔的背景声明（排除CSS函数内的逗号，如rgb(), rgba()等）
  // 这个正则表达式会匹配CSS函数外的逗号
  const commaOutsideFunctions = /,(?![^(]*\))/g;
  return commaOutsideFunctions.test(cssRule);
}

// 处理CSS文件中的图片URL
export function processCssFiles(outputPath: string): void {
  console.log('开始处理CSS文件中的图片URL...');

  // 查找所有CSS文件
  const cssFiles = glob.sync(path.join(outputPath, '**/*.css'));
  let processedFiles = 0;

  // 处理每个CSS文件
  cssFiles.forEach((cssFilePath) => {
    try {
      // 读取CSS文件内容
      let cssContent = fs.readFileSync(cssFilePath, 'utf-8');

      // 原始内容的备份，用于比较是否有变化
      const originalContent = cssContent;

      // 匹配所有背景图片URL
      // 这个正则表达式匹配CSS中的url()函数，并捕获图片路径
      const urlRegex = /url\(['"]?([^'")]+\.(jpe?g|png))['"]?\)/gi;

      // 替换所有匹配项
      cssContent = cssContent.replace(
        urlRegex,
        (match, imgPath, extension, offset) => {
          // 如果已经是WebP或者是数据URI，不处理
          // 如果是WebP、数据URI或网络图片（以http或https开头），不处理
          if (
            imgPath.endsWith('.webp') ||
            imgPath.startsWith('data:') ||
            imgPath.startsWith('http://') ||
            imgPath.startsWith('https://')
          ) {
            return match;
          }

          // 获取当前CSS规则，检查是否已经是多重背景
          // 找到包含当前url()的CSS规则
          // 向前查找到最近的{，向后查找到最近的}
          let startPos = offset;
          while (startPos > 0 && cssContent[startPos] !== '{') startPos--;

          let endPos = offset;
          while (endPos < cssContent.length && cssContent[endPos] !== '}')
            endPos++;

          // 提取当前CSS规则
          const currentRule = cssContent.substring(startPos + 1, endPos);

          // 检查是否已经是多重背景
          if (isMultipleBackground(currentRule)) {
            // 如果已经是多重背景，不处理，返回原始匹配
            return match;
          }

          // 构造WebP版本的路径
          const webpPath = imgPath.replace(/\.(jpe?g|png)$/i, '.webp');

          // 使用特殊标记，后续替换
          return `__WEBP_PLACEHOLDER__${imgPath}__${webpPath}__`;
        },
      );

      // 处理特殊标记，将它们替换为CSS变量方案
      const placeholderRegex = /__WEBP_PLACEHOLDER__([^_]+)__([^_]+)__/g;

      // 收集所有需要添加CSS变量处理的图片
      const webpReplacements: Array<{ original: string; webp: string }> = [];
      let match;
      while ((match = placeholderRegex.exec(cssContent)) !== null) {
        webpReplacements.push({
          original: match[1],
          webp: match[2],
        });
      }

      // 如果有需要处理的图片
      if (webpReplacements.length > 0) {
        // 先替换所有占位符为原始URL
        cssContent = cssContent.replace(placeholderRegex, 'url("$1")');

        // 在CSS文件末尾添加WebP相关的CSS变量样式规则
        cssContent += '\n\n/* WebP支持检测和替换 - 使用CSS变量方案 */\n';

        // 为每个图片添加WebP版本的选择器
        webpReplacements.forEach(({ original, webp }) => {
          // 查找使用了该图片的所有CSS选择器
          const selectorRegex = new RegExp(
            `([^{}]+{[^{}]*url\\(['"]?${escapeRegExp(
              original,
            )}['"]?\\)[^{}]*})`,
            'g',
          );
          let selectorMatch;

          while (
            (selectorMatch = selectorRegex.exec(originalContent)) !== null
          ) {
            const fullRule = selectorMatch[1];
            const selector = fullRule
              .substring(0, fullRule.indexOf('{'))
              .trim();

            // 使用CSS变量选择器而不是属性选择器
            // 为支持WebP的情况添加样式（通过CSS变量）
            cssContent += `html[data-webp-support="yes"] {\n`;
            cssContent += `  ${selector} { background-image: url("${webp}"); }\n`;
            cssContent += `}\n\n`;

            // 为不支持WebP的情况添加样式（通过CSS变量）
            // 注意：下面这段可以省略，因为默认规则已经使用原始图片
            // 但为了完整性和明确性，我们还是添加它
            cssContent += `html[data-webp-support="no"] {\n`;
            cssContent += `  ${selector} { background-image: url("${original}"); }\n`;
            cssContent += `}\n\n`;
          }
        });

        // 添加WebP检测脚本，在HTML中插入该脚本
        // 注意：通常这个脚本应该通过插件的其他部分注入到HTML中，这里只生成样式规则

        // 写回文件
        fs.writeFileSync(cssFilePath, cssContent);
        processedFiles++;
      }
    } catch (error) {
      console.error(`处理CSS文件失败 ${cssFilePath}:`, error);
    }
  });

  console.log(`CSS处理完成，共处理 ${processedFiles} 个文件`);
}
