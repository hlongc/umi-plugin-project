import * as t from '@babel/types';
import { IApi } from '@umijs/max';
import { winPath } from '@umijs/max/plugin-utils';
import { join } from 'path';
import { ModelUtils } from './utils';

export function withTmpPath(opts: {
  api: IApi;
  path: string;
  noPluginDir?: boolean;
}) {
  return winPath(
    join(
      opts.api.paths.absTmpPath,
      opts.api.plugin.key && !opts.noPluginDir
        ? `plugin-${opts.api.plugin.key}`
        : '',
      opts.path,
    ),
  );
}

export default (api: IApi) => {
  api.describe({
    key: 'ronnieModel',
    config: {
      schema({ zod }) {
        return zod
          .object({
            extraModels: zod.array(zod.string()),
            name: zod.string().default('hlc'),
          })
          .partial();
      },
    },
    enableBy: api.EnableBy.config,
  });
  // 生成临时文件时会一直触发
  api.onGenerateFiles(async ({ files, isFirstTime }) => {
    console.log('ronnieModel', files);
    console.log('ronnieModel', isFirstTime);
    const models = await getAllModels(api);
    console.log('models', models);
    // 生成运行时文件
    api.writeTmpFile({
      path: 'runtime.ts',
      content: `
// 运行时代码
export function onMounted() {
  console.log('ronnieModel runtime mounted');
}
      `.trim(),
    });
  });
  /**
   * 1.监听项目中 src/models 目录下的文件变化
   * 2.当该目录下的文件发生变化时，会触发重新生成临时文件的操作
   */
  api.addTmpGenerateWatcherPaths(() => {
    return [join(api.paths.absSrcPath, 'models')];
  });
  // 添加运行时插件，在浏览器中执行，也就是属于业务代码，影响业务逻辑的
  api.addRuntimePlugin(() => {
    return [withTmpPath({ api, path: 'runtime.ts' })];
  });
};

async function getAllModels(api: IApi) {
  debugger;
  // 获取@@initialState、qiankunStateForSlave、qiankunStateForMaster这些额外的model
  const extraModels = await api.applyPlugins({
    key: 'addExtraModels',
    type: api.ApplyPluginsType.add,
    initialValue: [],
  });
  console.log('extraModels', extraModels, api.config);

  return new ModelUtils(api, {
    astTest({ node }) {
      return t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node);
    },
  }).getAllModels({
    sort: {},
    extraModels: [
      ...extraModels,
      ...(api.config.ronnieModel.extraModels || []),
    ],
  });
}
