import * as Babel from '@babel/core';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { IApi } from '@umijs/max';
import { Loader, TransformResult, transformSync } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'fs';
import { minimatch } from 'minimatch';
import { basename, dirname, extname, format, join, relative } from 'path';

interface ITopologicalNode {
  namespace: string;
  deps: string[];
  index: number;
  in: number;
  childs: ITopologicalNode[];
}

export function getIdentifierDeclaration(node: t.Node, path: Babel.NodePath) {
  if (t.isIdentifier(node) && path.scope.hasBinding(node.name)) {
    let bindingNode = path.scope.getBinding(node.name)!.path.node;
    if (t.isVariableDeclarator(bindingNode)) {
      bindingNode = bindingNode.init!;
    }
    return bindingNode;
  }
  return node;
}
/** 将路径转换为通用格式，除windows长路径 */
export function winPath(path: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  if (isExtendedLengthPath) {
    return path;
  }
  return path.replace(/\\/g, '/');
}

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

/** 生成命名空间 */
function getNamespace(absFilePath: string, absSrcPath: string) {
  const relPath = winPath(relative(winPath(absSrcPath), winPath(absFilePath)));
  const pathList = relPath.split('/');
  const dirs = pathList.slice(0, -1);
  const file = pathList[pathList.length - 1];

  const validDirs = dirs.filter(
    (dir) => !['src', 'pages', 'models'].includes(dir),
  );
  let normalizedFile = file;
  // one.two.model.ts => one.two.model
  normalizedFile = basename(file, extname(file));
  if (normalizedFile.endsWith('.model')) {
    // one.two.model => one.two
    normalizedFile = normalizedFile.split('.').slice(0, -1).join('.');
  }
  return [...validDirs, normalizedFile].join('.');
}

export class Model {
  /** 文件path */
  file: string;
  /** 命名空间，useModel("xxx")中的xxx */
  namespace: string;
  id: string;
  exportName: string;
  deps: string[];

  constructor(file: string, absSrcPath: string, id: number) {
    let namespace;
    let exportName;
    // 处理这种文件名 '@@initialState.ts#{"namespace":"@@initialState"}'
    const [_file, meta] = file.split('#');
    if (meta) {
      const metaObj: Record<string, string> = JSON.parse(meta);
      namespace = metaObj.namespace;
      exportName = metaObj.exportName;
    }

    this.id = `model_${id}`;
    this.file = _file;
    this.namespace = namespace || getNamespace(_file, absSrcPath);
    this.exportName = exportName || 'default';
    this.deps = this.findDeps();
  }
  /** 找出当前model依赖的其他model */
  findDeps() {
    const content = readFileSync(this.file, 'utf8');
    const loader = extname(this.file).slice(1) as Loader;
    const result = transformSync(content, {
      loader,
      minify: false,
      sourcemap: false,
    });

    const ast = parser.parse(result.code, {
      sourceFilename: this.file,
      sourceType: 'module',
      plugins: [],
    });

    const deps = new Set<string>();
    traverse(ast, {
      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee, { name: 'useModel' }) &&
          t.isStringLiteral(path.node.arguments[0])
        ) {
          deps.add(path.node.arguments[0].value);
        }
      },
    });

    return [...deps];
  }
}

export class ModelUtils {
  api: IApi;
  opts: any;

  constructor(api: IApi, opts = {}) {
    this.api = api;
    this.opts = opts;
  }

  glob(path: string, pattern: string) {
    const modelsPath: string[] = [];
    const findFile = (fullPath: string) => {
      const files = readdirSync(fullPath);
      files.forEach((filePath) => {
        const stat = statSync(join(fullPath, filePath));
        if (stat.isFile()) {
          if (minimatch(filePath, pattern)) {
            modelsPath.push(join(fullPath, filePath));
          }
        } else if (stat.isDirectory()) {
          findFile(join(fullPath, filePath));
        }
      });
    };

    findFile(path);

    return modelsPath;
  }

  getAllModels({ extraModels = [] }: { extraModels?: string[] }) {
    let id = 0;
    const models = [
      ...this.getModels({
        pattern: '**/*.{ts,tsx,js,jsx}',
        base: join(this.api.paths.absSrcPath, 'models'),
      }),
      ...extraModels,
    ].map((file) => {
      return new Model(file, this.api.paths.absSrcPath, ++id);
    });
    // 对模块进行拓扑排序，解决模块之间互相依赖问题
    const namespaces: string[] = ModelUtils.topologicalSort(models);
    models.sort(
      (a, b) =>
        namespaces.indexOf(a.namespace) - namespaces.indexOf(b.namespace),
    );

    return models;
  }

  // https://github.com/umijs/umi/issues/9837
  static topologicalSort = (models: Model[]) => {
    // build depts graph
    const graph: Array<ITopologicalNode | undefined> = [];
    const namespaceToNode: Record<string, ITopologicalNode> = {};
    models.forEach((model, index) => {
      const node: ITopologicalNode = {
        namespace: model.namespace,
        deps: model.deps,
        index,
        in: 0,
        childs: [],
      };
      if (namespaceToNode[model.namespace]) {
        throw new Error(`Duplicate namespace in models: ${model.namespace}`);
      }
      namespaceToNode[model.namespace] = node;
      graph.push(node);
    });

    // build edges.
    (graph as ITopologicalNode[]).forEach((node) => {
      node.deps.forEach((dep) => {
        const depNode = namespaceToNode[dep];
        if (!depNode) {
          throw new Error(`Model namespace not found: ${dep}`);
        }
        depNode.childs.push(node);
        node.in++;
      });
    });

    const queue: string[] = [];
    while (true) {
      // find first 0 in node;
      const zeronode = graph.find((n) => {
        return n && n.in === 0;
      });
      if (!zeronode) {
        break;
      }

      queue.push(zeronode.namespace);
      zeronode.childs.forEach((child) => {
        child.in--;
      });
      zeronode.childs = [];
      delete graph[zeronode.index];
    }

    const leftNodes = graph.filter(Boolean) as ITopologicalNode[];
    if (leftNodes.length > 0) {
      throw new Error(
        `Circle dependency detected in models: ${leftNodes
          .map((m) => m.namespace)
          .join(', ')}`,
      );
    }

    return queue;
  };

  getModels({ pattern, base }: { pattern: string; base: string }) {
    return this.glob(base, pattern).filter((url) => {
      // 过滤类型声明文件 *.d.ts
      if (/\.d.ts$/.test(url)) return false;
      // 测试文件也过滤
      if (/\.(test|e2e|spec).([tj])sx?$/.test(url)) return false;
      const content = readFileSync(url, 'utf8');
      return this.isValidModel(url, content);
    });
  }

  isValidModel(filePath: string, content: string): boolean {
    let result: TransformResult | null = null;

    try {
      const ext = extname(filePath).slice(1);
      const loader = ext === 'js' ? 'jsx' : (ext as Loader);
      // transform with esbuild first
      // to reduce unexpected ast errors
      // 通过esbuild把jsx、ts编译为js
      result = transformSync(content, {
        loader,
        sourcemap: false,
        minify: false,
        sourcefile: filePath,
        tsconfigRaw: {
          compilerOptions: {
            experimentalDecorators: true,
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
    // 通过babel转换为ast
    let ret = false;

    const ast = parser.parse(result!.code, {
      sourceType: 'module', // 因为当前项目中都是用的模块化写法
      sourceFilename: filePath,
      plugins: [],
    });

    // 遍历模型文件的ast，看下默认导出是不是一个函数或者箭头函数
    traverse(ast, {
      ExportDefaultDeclaration(path) {
        let node = path.node.declaration;
        // @ts-ignore
        node = getIdentifierDeclaration(node, path);
        if (
          t.isArrowFunctionExpression(node) ||
          t.isFunctionDeclaration(node)
        ) {
          ret = true;
        }
      },
    });

    return ret;
  }

  static getContents(models: Model[]) {
    const imports: string[] = [];
    const modelsContent: string[] = [];

    models.forEach((model) => {
      const fileWithoutExt = winPath(
        format({
          dir: dirname(model.file),
          base: basename(model.file, extname(model.file)),
        }),
      );
      if (model.exportName !== 'default') {
        imports.push(
          `import ${model.exportName} as ${model.id} from '${fileWithoutExt}';`,
        );
      } else {
        imports.push(`import ${model.id} from '${fileWithoutExt}';`);
      }

      modelsContent.push(
        `${model.id}: { namespace: '${model.namespace}', model: ${model.id} }`,
      );
    });

    return `
${imports.join('\n')}

export const models = {
${modelsContent.join(',\n')}
} as const;
    `;
  }
}
