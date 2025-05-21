# WebP 图片转换与使用指南

## 简介

本项目集成了 WebP 图片转换功能，可以自动将 JPG、JPEG、PNG 图片转换为 WebP 格式，并在支持 WebP 的浏览器中使用 WebP 图片，在不支持的浏览器中自动回退到原始格式。

WebP 格式具有以下优势：

- 比 JPG 小约 25-35%，视觉质量相当
- 比 PNG 小约 26%，同时支持透明度
- 加载速度更快，提升用户体验
- 减少带宽使用，降低服务器负载

## 配置选项

在`.umirc.ts`中配置 WebP 转换器：

```typescript
export default defineConfig({
  // 其他配置...
  webpConverter: {
    quality: 80, // WebP图片质量(0-100)
    lossless: false, // 是否使用无损压缩
    onlySmallerFiles: true, // 是否只保留比原文件小的WebP
    minQuality: 60, // 自动降低质量时的最低限制
    processCss: true, // 是否处理CSS文件中的图片URL
  },
  // 其他配置...
});
```

## 使用方法

### 1. 在 HTML 中使用`<img>`标签

使用`ImageWebp`组件自动处理图片：

```tsx
import { ImageWebp } from '@/components/ImageWebp';

// 使用方法与普通img标签完全相同
<ImageWebp src="/images/photo.jpg" alt="照片" />;
```

### 2. 在 CSS 中使用背景图片

构建后的 CSS 文件会自动添加 WebP 支持检测和替换，无需额外操作。

例如，原始 CSS：

```css
.banner {
  background-image: url('/images/banner.jpg');
}
```

构建后会自动添加：

```css
.banner {
  background-image: url('/images/banner.jpg');
}

@supports (
  background-image:
    url(data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=)
) {
  .banner {
    background-image: url('/images/banner.webp') url('/images/banner.jpg');
  }
}
```

### 4. 在内联样式中使用

使用`useWebpUrl`工具函数：

```tsx
import { useWebpUrl } from '@/utils/webpUtils';

function MyComponent() {
  const bgUrl = useWebpUrl('/images/background.jpg');

  return <div style={{ backgroundImage: `url(${bgUrl})` }}>内容</div>;
}
```

### 5. 在 CSS 变量中使用

```tsx
import { useWebpUrl } from '@/utils/webpUtils';

function MyComponent() {
  const bgUrl = useWebpUrl('/images/background.jpg');

  React.useEffect(() => {
    document.documentElement.style.setProperty('--bg-image', `url(${bgUrl})`);
  }, [bgUrl]);

  return <div className="my-bg-element">内容</div>;
}
```

```css
.my-bg-element {
  background-image: var(--bg-image);
}
```

## 开发环境

在开发环境中，所有组件都会使用原始图片格式（JPG/PNG），这样便于调试和开发。只有在生产环境构建后，才会启用 WebP 转换和使用。

## 注意事项

1. WebP 转换只在生产环境构建时执行
2. 确保服务器正确配置了 WebP 的 MIME 类型：`image/webp`
3. 如果使用 CDN，确保 CDN 支持 WebP 格式
4. 原始图片会保留，以便不支持 WebP 的浏览器使用
