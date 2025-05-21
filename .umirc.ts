import { defineConfig } from '@umijs/max';

export default defineConfig({
  plugins: [
    require.resolve('./plugins2/model'),
    require.resolve('./plugins2/web-converter'),
  ],
  antd: {},
  hlcModel: { name: 'ronnie' },
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
