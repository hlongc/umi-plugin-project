import { IApi } from '@umijs/max';
import { ModelUtils } from './ModelUtils';

async function getModels(api: IApi) {
  // 获取额外注册的模型：@@initialState 、 @@qiankuanStateForSlave
  const extraModels = await api.applyPlugins({
    key: 'addExtraModels',
    type: api.ApplyPluginsType.add,
    initialValue: [],
  });

  return new ModelUtils(api).getAllModels({
    extraModels: [
      ...extraModels,
      ...(api.config?.ronnieModel?.extraModels || []),
    ],
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
    console.log(models);
  });
};
