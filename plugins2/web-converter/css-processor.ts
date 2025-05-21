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
          if (imgPath.endsWith('.webp') || imgPath.startsWith('data:')) {
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

          // 构造支持WebP的CSS，使用image-set()或者@supports条件
          // 方法1: 使用image-set (更现代但支持有限)
          // return `url("${imgPath}"), image-set(url("${webpPath}") type("image/webp"), url("${imgPath}") type("image/jpeg"))`;

          // 方法2: 使用@supports (更好的兼容性)
          // 但由于我们不能在这里直接插入@supports块，我们需要返回一个特殊的标记
          // 这个标记将在后续处理中被替换为完整的@supports块
          return `__WEBP_PLACEHOLDER__${imgPath}__${webpPath}__`;
        },
      );

      // 处理特殊标记，将它们替换为@supports块
      // 这种方法允许我们为每个图片添加单独的@supports检查
      const placeholderRegex = /__WEBP_PLACEHOLDER__([^_]+)__([^_]+)__/g;

      // 收集所有需要添加@supports块的图片
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

        // 在CSS文件末尾添加@supports块
        cssContent += '\n\n/* WebP支持检测和替换 */\n';
        cssContent +=
          '@supports (background-image: url(data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=)) {\n';

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

            // 为该选择器添加WebP版本，使用多重背景实现回退
            // 如果WebP图片不存在，浏览器会自动尝试加载第二个背景图片（原始图片）
            cssContent += `  ${selector} { background-image: url("${webp}"), url("${original}"); }\n`;
          }
        });

        cssContent += '}\n';

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
