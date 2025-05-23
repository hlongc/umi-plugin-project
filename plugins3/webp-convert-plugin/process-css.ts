/**
 * CSS图片处理器
 * 用于处理CSS文件中的背景图片，支持WebP格式和回退方案
 *
 * 工作原理：
 * 1. 扫描构建输出目录中的所有CSS文件
 * 2. 在每个CSS文件中查找使用了背景图片(jpg/png)的选择器
 * 3. 为每个背景图片创建对应的WebP版本
 * 4. 在CSS文件末尾添加特性检测代码，根据浏览器是否支持WebP格式来加载不同版本的图片
 * 5. 保持原始CSS不变，通过添加特性检测规则来实现优雅降级
 */

import fs from 'fs';
import glob from 'glob';
import path from 'path';

/**
 * 检查CSS规则是否包含多重背景声明
 * 多重背景有两种情况：
 * 1. 一个属性中包含多个url()函数
 *    例如: background: url(img1.jpg), url(img2.jpg);
 * 2. 属性值中包含逗号分隔的多个背景
 *    例如: background: url(img1.jpg) top left no-repeat, url(img2.jpg) bottom right;
 *
 * @param cssRule CSS规则文本(不包含选择器和大括号)
 * @returns 是否是多重背景
 */
function isMultipleBackground(cssRule: string): boolean {
  // 检测是否包含多个url()函数
  // 例如: background: url(img1.jpg) top left, url(img2.jpg) bottom right;
  const urlCount = (cssRule.match(/url\(/g) || []).length;
  if (urlCount > 1) return true;

  // 检测是否有逗号分隔的背景声明（排除CSS函数内的逗号，如rgb(), rgba()等）
  // 这个正则表达式会匹配CSS函数外的逗号
  // 例如：background: url(img.jpg), linear-gradient(...)
  const commaOutsideFunctions = /,(?![^(]*\))/g;
  return commaOutsideFunctions.test(cssRule);
}

/**
 * 处理CSS文件中的背景图片URL，转换为支持WebP的版本
 *
 * 示例：
 * 输入CSS:
 * .my-class {
 *   background-image: url(image.jpg);
 * }
 *
 * 输出CSS:
 * .my-class {
 *   background-image: url(image.jpg);
 * }
 *
 * // WebP支持检测和替换
 * html[data-webp-support="yes"] .my-class {
 *   background-image: url("image.webp");
 * }
 *
 * html[data-webp-support="no"] .my-class {
 *   background-image: url("image.jpg");
 * }
 *
 * @param outputPath 构建输出目录的路径
 */
export function processCssFiles(outputPath: string): void {
  console.log('开始处理CSS文件中的图片URL...');

  // 查找输出目录中的所有CSS文件
  // 例如: ['/path/to/output/styles.css', '/path/to/output/theme.css']
  const cssFiles = glob.sync(path.join(outputPath, '**/*.css'));
  let processedFiles = 0;

  // 处理每个CSS文件
  cssFiles.forEach((cssFilePath) => {
    try {
      // 读取CSS文件内容
      let cssContent = fs.readFileSync(cssFilePath, 'utf-8');

      // 原始内容的备份，用于比较是否有变化，也用于后续分析
      const originalContent = cssContent;

      /**
       * 匹配background和background-image属性中的图片URL
       *
       * 这个正则表达式解析：
       * (?:background|background-image) - 匹配"background"或"background-image"属性（非捕获组）
       * \s*: - 匹配冒号前的任意空白
       * [^;]* - 匹配冒号后到分号前的所有字符（属性值）
       * url\( - 匹配"url("
       * ['"]? - 匹配可选的引号（单引号或双引号）
       * ([^'")]+\.(jpe?g|png)) - 捕获组1：匹配图片路径和扩展名(.jpg/.jpeg/.png)
       * ['"]? - 匹配可选的结束引号
       * \) - 匹配右括号")"
       *
       * 例如，它会匹配：
       * background: url(image.jpg)
       * background-image: url('image.png')
       * background: #fff url("path/to/image.jpeg") no-repeat center
       */
      const urlRegex =
        /(?:background|background-image)\s*:[^;]*url\(['"]?([^'")]+\.(jpe?g|png))['"]?\)/gi;

      // 创建图片路径映射数组，用于存储找到的所有背景图片信息
      const imagePathMappings: Array<{
        selector: string; // CSS选择器，例如 ".header-bg"
        property: string; // CSS属性名，例如 "background-image" 或 "background"
        original: string; // 原始图片路径，例如 "images/header.jpg"
        webp: string; // WebP图片路径，例如 "images/header.webp"
      }> = [];

      // 查找所有匹配的背景图片
      let urlMatch;
      // 使用exec方法循环查找所有匹配项
      while ((urlMatch = urlRegex.exec(originalContent)) !== null) {
        const imgPath = urlMatch[1]; // 捕获的图片路径，例如 "images/header.jpg"
        const offset = urlMatch.index; // 匹配项在CSS文本中的起始位置

        // 跳过不需要处理的图片：
        // 1. 已经是WebP格式的图片
        // 2. 数据URI（base64编码的内联图片）
        // 3. 网络图片（http/https开头的URL）
        if (
          imgPath.endsWith('.webp') ||
          imgPath.startsWith('data:') ||
          imgPath.startsWith('http://') ||
          imgPath.startsWith('https://')
        ) {
          continue;
        }

        /**
         * 查找并解析包含当前背景图片的CSS规则
         * 例如，从这样的CSS中：
         *
         * .header {
         *   color: #fff;
         *   background-image: url(header.jpg);
         *   padding: 20px;
         * }
         *
         * 我们需要提取：
         * 1. 选择器: ".header"
         * 2. 规则内容: "color: #fff; background-image: url(header.jpg); padding: 20px;"
         */

        // 向前查找到最近的花括号"{"，即CSS规则的开始位置
        let startPos = offset;
        while (startPos > 0 && originalContent[startPos] !== '{') startPos--;

        // 向后查找到最近的花括号"}"，即CSS规则的结束位置
        let endPos = offset;
        while (
          endPos < originalContent.length &&
          originalContent[endPos] !== '}'
        )
          endPos++;

        // 提取当前CSS规则内容（不包括花括号）
        // 例如："color: #fff; background-image: url(header.jpg); padding: 20px;"
        const currentRule = originalContent.substring(startPos + 1, endPos);

        // 检查是否已经是多重背景，如果是则跳过处理
        // 多重背景很复杂，需要特殊处理，例如：
        // background: url(img1.jpg) top left, url(img2.jpg) bottom right;
        if (isMultipleBackground(currentRule)) {
          continue;
        }

        /**
         * 提取CSS选择器
         * 例如，从这样的CSS中：
         *
         * .header {
         *   background-image: url(header.jpg);
         * }
         *
         * 我们需要提取选择器：".header"
         */
        // 找到选择器的起始位置（向前查找到换行符或上一个规则的结束"}"）
        let selectorStart = startPos;
        while (
          selectorStart > 0 &&
          originalContent[selectorStart - 1] !== '}' &&
          originalContent[selectorStart - 1] !== '\n'
        )
          selectorStart--;

        // 提取选择器文本并去除首尾空白
        // 例如：".header"
        const selector = originalContent
          .substring(selectorStart, startPos)
          .trim();

        /**
         * 从CSS规则中提取属性名（background 或 background-image）
         * 例如，从"background-image: url(header.jpg);"中提取"background-image"
         */
        const propertyMatch = /(?:background|background-image)\s*:/.exec(
          currentRule,
        );
        if (!propertyMatch) continue; // 如果找不到匹配的属性，跳过

        // 提取属性名并去除冒号和空白
        // 例如：提取"background-image:"得到"background-image"
        const property = propertyMatch[0].replace(':', '').trim();

        // 构造WebP版本的路径，将.jpg/.jpeg/.png替换为.webp
        // 例如："images/header.jpg" -> "images/header.webp"
        const webpPath = imgPath.replace(/\.(jpe?g|png)$/i, '.webp');

        // 将所有收集到的信息添加到映射数组
        imagePathMappings.push({
          selector, // 例如：".header"
          property, // 例如："background-image"
          original: imgPath, // 例如："images/header.jpg"
          webp: webpPath, // 例如："images/header.webp"
        });
      }

      // 如果找到了需要处理的图片，在CSS文件末尾添加WebP相关规则
      if (imagePathMappings.length > 0) {
        // 在CSS文件末尾添加注释和WebP相关的CSS规则
        cssContent += '\n\n/* WebP支持检测和替换 */\n';

        // 为每个图片添加WebP版本的选择器
        imagePathMappings.forEach(({ selector, property, original, webp }) => {
          /**
           * 生成针对支持WebP浏览器的CSS规则
           * 例如：
           * html[data-webp-support="yes"] .header {
           *   background-image: url("header.webp");
           * }
           *
           * 这里使用HTML属性选择器来检测WebP支持
           * data-webp-support="yes"表示浏览器支持WebP格式
           * 这个属性由前端JavaScript根据浏览器特性检测结果设置
           */
          cssContent += `html[data-webp-support="yes"] ${selector} {\n`;
          cssContent += `  ${property}: url("${webp}");\n`;
          cssContent += `}\n\n`;

          /**
           * 生成针对不支持WebP浏览器的CSS规则（可选）
           * 例如：
           * html[data-webp-support="no"] .header {
           *   background-image: url("header.jpg");
           * }
           *
           * 严格来说，这部分是可选的，因为原始CSS已经使用了非WebP格式
           * 但为了明确性和完整性，我们还是添加它
           */
          cssContent += `html[data-webp-support="no"] ${selector} {\n`;
          cssContent += `  ${property}: url("${original}");\n`;
          cssContent += `}\n\n`;
        });

        // 将处理后的CSS内容写回文件
        fs.writeFileSync(cssFilePath, cssContent);
        processedFiles++;
      }
    } catch (error) {
      console.error(`处理CSS文件失败 ${cssFilePath}:`, error);
    }
  });

  // 打印处理结果
  console.log(`CSS处理完成，共处理 ${processedFiles} 个文件`);
}
