import { defineConfig } from '@umijs/max';

export default defineConfig({
  plugins: [require.resolve('./plugins2/model')],
  antd: {},
  hlcModel: { name: 'ronnie' },
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
