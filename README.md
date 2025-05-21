# PostCSS WebP 背景图插件

这是一个 PostCSS 插件，用于自动将 CSS 中的背景图片转换为 WebP 格式，同时保留原始格式作为回退方案。

## 特性

- 自动检测 CSS 中的背景图片（支持 JPG、JPEG 和 PNG 格式）
- 添加对应的 WebP 版本作为优先选项
- 使用`image-set()`函数提供原始格式作为回退方案
- 支持多背景场景
- 开发环境下检查 WebP 文件是否存在并给出警告

## 安装

```bash
npm install postcss-webp-backgrounds --save-dev
```

## 使用方法

### 在 PostCSS 配置中使用

```js
// postcss.config.js
module.exports = {
  plugins: [require('postcss-webp-backgrounds')()],
};
```

### 在 UMI（Umi.js）项目中使用

```js
// .umirc.js 或 config/config.js
export default {
  extraPostCSSPlugins: [require('postcss-webp-backgrounds')()],
};
```

### 在 Webpack 中使用

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [require('postcss-webp-backgrounds')()],
              },
            },
          },
        ],
      },
    ],
  },
};
```

## 工作原理

### 转换示例

#### 输入 CSS

```css
.banner {
  background-image: url('images/banner.jpg');
}
```

#### 输出 CSS

```css
.banner {
  background-image: url('images/banner.jpg');
  background-image: /* webp */ image-set(
    url('images/banner.webp') type('image/webp'),
    url('images/banner.jpg') type('image/jpeg')
  );
}
```

### 支持的场景

1. 支持`background`和`background-image`属性
2. 支持多背景（使用逗号分隔的多个背景）
3. 支持相对路径和绝对路径
4. 支持带查询参数和 hash 的 URL

### 浏览器支持

`image-set()`函数支持情况：

- Chrome: 支持（加前缀）
- Firefox: 86 版本以上支持
- Safari: 支持（加前缀）
- Edge: 支持（基于 Chromium）

对于不支持`image-set()`的浏览器，会回退到第一个声明的原始图片格式。

## 注意事项

1. 确保为每个背景图片生成对应的 WebP 版本
2. 建议与[`autoprefixer`](https://github.com/postcss/autoprefixer)一起使用，以添加必要的浏览器前缀

## 配置选项

```js
require('postcss-webp-backgrounds')({
  // 是否使用autoprefixer添加浏览器前缀，默认为true
  autoprefixer: true,
});
```

## License

MIT
