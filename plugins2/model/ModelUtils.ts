import * as Babel from '@babel/core';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { IApi } from '@umijs/max';
import { Loader, TransformResult, transformSync } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'fs';
import { minimatch } from 'minimatch';
import { basename, extname, join, relative } from 'path';

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

export function winPath(path: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  if (isExtendedLengthPath) {
    return path;
  }
  return path.replace(/\\/g, '/');
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

export class Module {
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
    this.deps = [];
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
    const models = [
      ...this.getModels({
        pattern: '**/*.{ts,tsx,js,jsx}',
        base: join(this.api.paths.absSrcPath, 'models'),
      }),
      ...extraModels,
    ].map((file) => {});

    return models;
  }

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
}
