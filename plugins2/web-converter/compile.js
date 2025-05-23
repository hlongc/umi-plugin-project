#!/usr/bin/env node
/**
 * 编译 TypeScript 文件为 JavaScript
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 获取当前目录
const currentDir = __dirname;

// 检查是否安装了 TypeScript
try {
  execSync('tsc --version', { stdio: 'ignore' });
} catch (error) {
  console.error('未找到 TypeScript，请先安装：npm install -g typescript');
  process.exit(1);
}

// 执行编译
try {
  console.log('开始编译 TypeScript 文件...');
  execSync('tsc', { cwd: currentDir, stdio: 'inherit' });
  console.log('编译完成！');

  // 检查是否生成了 JavaScript 文件
  const jsFile = path.join(currentDir, 'dist', 'webpack-import-loader.js');
  if (fs.existsSync(jsFile)) {
    console.log(`生成的 JavaScript 文件: ${jsFile}`);

    // 创建符号链接或复制文件到根目录
    const rootJsFile = path.join(currentDir, 'webpack-import-loader.js');
    if (fs.existsSync(rootJsFile)) {
      fs.unlinkSync(rootJsFile);
    }

    // 复制文件（而不是创建符号链接，因为某些环境可能不支持）
    fs.copyFileSync(jsFile, rootJsFile);
    console.log(`已将编译后的文件复制到: ${rootJsFile}`);
  } else {
    console.error('编译后未找到 JavaScript 文件');
  }
} catch (error) {
  console.error('编译过程中出错:', error);
  process.exit(1);
}
