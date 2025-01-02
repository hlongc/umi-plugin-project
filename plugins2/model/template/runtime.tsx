import { useMemo } from 'react';
// @ts-ignore
import { Provider } from './';
// @ts-ignore
import { models as rawModels } from './model';

function ProviderWrapper(props: any) {
  const models = useMemo(() => {
    return Object.keys(rawModels).reduce((memo: Record<string, any>, key) => {
      memo[rawModels[key].namespace] = rawModels[key].model;
      return memo;
    }, {});
  }, []);

  return (
    <Provider models={models} {...props}>
      {props.children}
    </Provider>
  );
}
// @ts-ignore
export function dataflowProvider(container, opts) {
  return <ProviderWrapper {...opts}>{container}</ProviderWrapper>;
}
