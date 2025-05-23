import { defineConfig } from '@umijs/max';

// 注册 ts-node 使 webpack 能够加载 .ts 文件
// 确保这一行在 webpack 配置之前
require('./plugins2/web-converter/register-ts-node');

// import WebpackImportWebpPlugin from './plugins2/web-converter/webpack-import-webp-plugin';

export default defineConfig({
  plugins: [
    require.resolve('./plugins2/model'),
    // require.resolve('./plugins2/web-converter'),
    require.resolve('./plugins3/webp-convert-plugin'),
  ],
  antd: {},
  hlcModel: { name: 'ronnie' },
  // chainWebpack: (config) => {
  //   config.plugin('WebpackImportWebpPlugin').use(WebpackImportWebpPlugin);
  // },
  // WebP 转换器配置
  webpConverter: {
    quality: 80, // WebP 图片质量(0-100)
    lossless: false, // 是否使用无损压缩
    onlySmallerFiles: true, // 是否只保留比原文件小的 WebP
    minQuality: 60, // 自动降低质量时的最低限制
    processCss: true, // 是否处理CSS文件中的图片URL
  },
  // model: {},
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      name: '首页',
      path: '/home',
      component: './Home',
    },
    {
      name: '权限演示',
      path: '/access',
      component: './Access',
    },
    {
      name: ' CRUD 示例',
      path: '/table',
      component: './Table',
    },
  ],
  npmClient: 'pnpm',
});
