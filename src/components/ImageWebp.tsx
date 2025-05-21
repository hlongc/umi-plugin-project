import { useEffect, useMemo, useState } from 'react';

/**
 * WebP支持状态编码:
 * 0: 正在检测中
 * 1: 浏览器支持WebP
 * 2: 浏览器不支持WebP
 */

// 全局共享的WebP支持检测结果，避免每个组件实例都重复检测
let globalWebpSupport: 0 | 1 | 2 = 0;
// 存储检测Promise，确保多个组件实例共享同一个检测过程
let checkPromise: Promise<void> | null = null;

/**
 * 自定义Hook：检测浏览器是否支持WebP格式
 * 返回值为0表示正在检测，1表示支持，2表示不支持
 * 使用全局状态缓存结果，提高性能，避免每个组件实例重复检测
 */
export const useWebpSupport = () => {
  // 初始化状态为全局缓存值
  const [supportsWebp, setSupportsWebp] = useState<0 | 1 | 2>(
    globalWebpSupport,
  );

  useEffect(() => {
    // 如果已经有检测结果，不再重复检测
    if (globalWebpSupport !== 0) {
      return;
    }

    // 如果检测尚未开始，创建新的检测Promise
    if (!checkPromise) {
      checkPromise = (async () => {
        // 检查是否支持createImageBitmap API（不支持则无法检测WebP，视为不支持）
        if (!self.createImageBitmap) {
          globalWebpSupport = 2; // 设置为不支持
          setSupportsWebp(2);
          return;
        }

        // WebP测试图像的base64编码数据
        // 这是一个最小的有效WebP图像
        const webpData =
          'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

        // 将base64数据转换为Blob对象
        const blob = await fetch(webpData).then((r) => r.blob());

        try {
          // 尝试创建ImageBitmap，如果成功则说明支持WebP
          await createImageBitmap(blob);
          globalWebpSupport = 1; // 设置为支持
          setSupportsWebp(1);
        } catch (e) {
          // 失败则说明不支持WebP
          globalWebpSupport = 2; // 设置为不支持
          setSupportsWebp(2);
        }
      })();
    } else {
      // 如果检测已经开始但尚未完成，等待现有Promise完成后更新状态
      checkPromise.then(() => {
        setSupportsWebp(globalWebpSupport);
      });
    }
  }, []); // 空依赖数组确保effect只运行一次

  return supportsWebp;
};

/**
 * ImageWebp组件：智能处理图片加载，自动使用WebP格式（如果浏览器支持）
 *
 * 组件会：
 * 1. 检测浏览器是否支持WebP
 * 2. 如果支持，尝试加载WebP版本图片
 * 3. 如果WebP版本加载失败或浏览器不支持WebP，回退到原始图片格式
 * 4. 在开发环境中始终使用原始格式，便于调试
 *
 * @param src 原始图片URL（jpg/jpeg/png格式）
 * @param props 其他标准img标签属性
 */
export function ImageWebp({
  src,
  ...props
}: React.DetailedHTMLProps<
  React.ImgHTMLAttributes<HTMLImageElement>,
  HTMLImageElement
> & { src: string }) {
  // 检测浏览器是否支持WebP
  const isSupportWebp = useWebpSupport();
  // 记录WebP图片是否加载失败
  const [isError, setIsError] = useState(false);

  // 当src变化时重置错误状态
  useEffect(() => {
    setIsError(false);
  }, [src]);

  // 构造对应的WebP图片URL（简单替换扩展名）
  const webpSrc = src.replace(/\.(jpg|jpeg|png)$/, '.webp');

  // 确定最终使用的图片URL
  const realSrc = useMemo(() => {
    // 在以下情况使用原始图片：
    // 1. WebP加载出错
    // 2. 浏览器不支持WebP
    // 3. 开发环境（便于调试）
    if (
      isError ||
      isSupportWebp === 2 ||
      process.env.NODE_ENV === 'development'
    )
      return src;

    // 否则使用WebP版本
    return webpSrc;
  }, [src, webpSrc, isError, isSupportWebp]);

  // 如果WebP支持状态尚未确定，暂不渲染图片
  if (isSupportWebp === 0) {
    return null;
  }

  // 渲染图片组件
  return (
    <img
      src={realSrc}
      {...props}
      onError={(e) => {
        // 调用原始onError处理器（如果存在）
        props?.onError?.(e);
        // 标记WebP加载失败，会在下一次渲染中切换回原图
        setIsError(true);
      }}
    />
  );
}
