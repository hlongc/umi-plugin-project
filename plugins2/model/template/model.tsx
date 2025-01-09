// @ts-ignore
import type { models as rawModels } from '@@/plugin-hlcModel/model';
import isEqual from 'fast-deep-equal';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Models = typeof rawModels;

type GetNamespaces<M> = {
  [K in keyof M]: M[K] extends { namespace: string }
    ? M[K]['namespace']
    : never;
}[keyof M];

type Namespaces = GetNamespaces<Models>;
// @ts-ignore
const Context = createContext<{ dispatcher: Dispatcher }>(null);

// 用于保存model的数据，并触发更新
class Dispatcher {
  callbacks: Record<Namespaces, Set<(...args: any) => any>> = {};
  /** 保存所有model的导出的数据 */
  data: Record<Namespaces, unknown> = {};
  update = (namespace: Namespaces) => {
    if (this.callbacks[namespace]) {
      this.callbacks[namespace].forEach((cb) => {
        try {
          cb(this.data[namespace]);
        } catch (e) {
          cb(undefined);
        }
      });
    }
  };
}

interface ExecutorProps {
  /** 编写导出model的hook */
  hook: () => any;
  onUpdate: (val: any) => void;
  namespace: string;
}

function Executor(props: ExecutorProps) {
  const { hook, namespace, onUpdate } = props;

  const onupdateRef = useRef(onUpdate);
  const initialRef = useRef(false);

  let data: any;

  try {
    data = hook();
  } catch (e) {
    console.error(
      `hlc-model plugin: Invoking ${namespace || 'unknow'} 异常`,
      e,
    );
  }
  // 首次渲染时立即执行初始化
  useMemo(() => {
    onupdateRef.current(data);
  }, []);
  // 后续更新时，执行更新
  useEffect(() => {
    if (initialRef.current) {
      onupdateRef.current(data);
    } else {
      initialRef.current = true;
    }
  });

  return null;
}

const dispatcher = new Dispatcher();

export function Provider({
  models,
  children,
}: {
  models: Record<string, any>;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={{ dispatcher }}>
      {Object.keys(models).map((namespace) => (
        <Executor
          key={namespace}
          hook={models[namespace]}
          namespace={namespace}
          onUpdate={(val) => {
            // 更新model的数据
            dispatcher.data[namespace as Namespaces] = val;
            dispatcher.update(namespace as Namespaces);
          }}
        />
      ))}
      {children}
    </Context.Provider>
  );
}

/**
 * 拿到model导出函数的类型推断；拿到此处data的类型
   const data = useModel("user")
 */
type GetModelByNamespace<M, N> = {
  [K in keyof M]: M[K] extends { namespace: string; model: any }
    ? M[K]['namespace'] extends N
      ? M[K]['model'] extends () => any
        ? ReturnType<M[K]['model']>
        : never
      : never
    : never;
}[keyof M];

type Model<N> = GetModelByNamespace<Models, N>;

type Selector<N, S> = (model: Model<N>) => S;
/**
 * 拿到下面data的类型，也是第二个参数返回值的类型
 const data = useModel("user", (model) => {
  return {
    name: model.xxx,
    age: model.xxx
  }
 })
 */
type SelectedModel<N, T> = T extends (...args: any) => any
  ? ReturnType<NonNullable<T>>
  : Model<N>;

export function useModel<N extends Namespaces>(namespace: N): Model<N>;

export function useModel<N extends Namespaces, S>(
  namespace: N,
  selector: Selector<N, S>,
): SelectedModel<N, S>;

export function useModel<N extends Namespaces, S>(
  namespace: N,
  selector?: Selector<N, S>,
): SelectedModel<N, typeof selector> {
  const { dispatcher } = useContext(Context);

  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const [state, setState] = useState<any>(() =>
    selectorRef.current
      ? selectorRef.current(dispatcher.data[namespace] as any)
      : dispatcher.data[namespace],
  );

  const stateRef = useRef<any>(state);
  stateRef.current = state;

  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = (data: any) => {
      if (!isMountedRef.current) {
        // 可能组件被卸载了，就进行全局强制更新
        setTimeout(() => {
          dispatcher.data[namespace] = data;
          dispatcher.update(namespace);
        });
      } else {
        const currentState = selectorRef.current
          ? selectorRef.current(data)
          : data;
        const prevState = stateRef.current;

        if (!isEqual(currentState, prevState)) {
          stateRef.current = currentState;
          setState(currentState);
        }
      }
    };

    dispatcher.callbacks[namespace] ||= new Set();
    dispatcher.callbacks[namespace].add(handler);
    dispatcher.update(namespace);

    return () => {
      dispatcher.callbacks[namespace].delete(handler);
    };
  }, [namespace]);

  return state;
}
