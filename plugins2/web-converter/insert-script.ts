import type { IApi } from '@umijs/max'; // 导入 Umi 的 API 类型定义
import fs from 'fs';
import path from 'path';

// 导出插件主函数，该函数接收 api 参数，这是 Umi 提供的插件 API 接口
export default function (api: IApi) {
  if (process.env.NODE_ENV === 'production') {
    api.addHTMLHeadScripts(() =>
      fs.readFileSync(path.resolve(__dirname, './webp-detector.js'), 'utf-8'),
    );
  }
}
