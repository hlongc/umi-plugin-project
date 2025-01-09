import { IApi } from '@umijs/max';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ModelUtils, winPath, withTmpPath } from './ModelUtils';

async function getModels(api: IApi) {
  // 获取额外注册的模型：@@initialState 、 @@qiankuanStateForSlave
  const extraModels = await api.applyPlugins({
    key: 'addExtraModels',
    type: api.ApplyPluginsType.add,
    initialValue: [],
  });

  return new ModelUtils(api).getAllModels({
    extraModels: [...extraModels, ...(api.config?.hlcModel?.extraModels || [])],
  });
}

export default (api: IApi) => {
  api.describe({
    key: 'hlcModel',
    config: {
      schema: ({ zod }) => {
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

  api.onGenerateFiles(async () => {
    const models = await getModels(api);
    api.writeTmpFile({
      path: 'model.ts',
      content: ModelUtils.getContents(models),
    });

    const indexContent = readFileSync(
      join(__dirname, './template/model.tsx'),
      'utf8',
    ).replace('fast-deep-equal', winPath(require.resolve('fast-deep-equal')));

    api.writeTmpFile({
      path: 'index.tsx',
      content: indexContent,
    });

    api.writeTmpFile({
      path: 'runtime.tsx',
      content: readFileSync(join(__dirname, './template/runtime.tsx'), 'utf8'),
    });
  });

  // 监听model文件变化，实时重新生成
  api.addTmpGenerateWatcherPaths(() => {
    return [join(api.paths.absSrcPath, 'models')];
  });

  api.addRuntimePlugin(() => {
    const path = withTmpPath({ api, path: 'runtime.tsx' });
    console.log('addRuntimePlugin', path);
    return [withTmpPath({ api, path: 'runtime.tsx' })];
  });
};
