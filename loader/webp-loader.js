const loaderUtils = require('loader-utils');
const path = require('path');

/**
 * WebP Loader - 将图片转换为 WebP 格式
 *
 * @param {Buffer} content - 原始图片的 buffer 数据
 * @returns {Promise<Buffer>} 转换后的 WebP 图片 buffer
 */
async function webpLoader(content) {
  // 标记这是一个异步 loader
  const callback = this.async();

  try {
    // 动态导入 sharp 库 (更可靠的图像处理库，不依赖外部二进制文件)
    const sharp = await import('sharp');

    // 使用 this.getOptions() 获取配置选项，这是 webpack 5 推荐的方式
    const options = this.getOptions() || {};

    // 设置默认 WebP 转换选项
    const webpOptions = {
      quality: options.quality || 80,
      lossless: options.lossless || false,
      ...options.webp,
    };

    // 使用 sharp 处理图片并转换为 WebP
    const result = await sharp.default(content).webp(webpOptions).toBuffer();

    // 生成输出文件名
    const outputFilename = loaderUtils.interpolateName(
      this,
      options.name || '[name].webp',
      {
        content: result,
        context: options.context || this.rootContext,
      },
    );

    // 如果需要，发出文件
    if (options.emit !== false) {
      this.emitFile(outputFilename, result);
    }

    // 根据配置决定返回什么
    if (options.outputPath) {
      const publicPath = options.publicPath || '';
      const outputPath = path.join(options.outputPath, outputFilename);
      const finalPath = publicPath
        ? path.join(publicPath, outputFilename)
        : outputPath;

      callback(null, `module.exports = ${JSON.stringify(finalPath)}`);
    } else {
      // 默认返回转换后的 buffer
      callback(null, `module.exports = ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error('WebP 转换错误:', error);
    callback(error);
  }
}

// 设置 loader 处理的是二进制数据
webpLoader.raw = true;

module.exports = webpLoader;
