/**
 * 注册 ts-node，使 webpack 能够直接加载 .ts 文件
 */
const path = require('path');

// 注册 ts-node
require('ts-node').register({
  transpileOnly: true, // 只转译，不做类型检查，提高性能
  compilerOptions: {
    module: 'commonjs', // 使用 CommonJS 模块系统
    target: 'es2018', // 目标 ES 版本
    esModuleInterop: true, // 启用 ES 模块互操作性
  },
  // 自定义项目根目录，以便找到 tsconfig.json
  project: path.resolve(__dirname, 'tsconfig.json'),
});

// 导出一个空对象，当这个文件被 require 时不会报错
module.exports = {};
