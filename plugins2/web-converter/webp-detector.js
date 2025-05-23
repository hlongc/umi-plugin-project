/**
 * WebP格式支持检测脚本
 * 用于检测浏览器是否支持WebP格式，并设置CSS变量
 */

(function detectWebP() {
  // 创建一个测试的WebP图片
  const webP = new Image();

  // 设置样式表内容的函数
  function setWebPSupport(isSupported) {
    const value = isSupported ? 'yes' : 'no';
    document.documentElement.setAttribute('data-webp-support', value);
  }

  // 设置默认值（假设不支持）
  setWebPSupport(false);

  // 设置图片加载成功和失败的处理函数
  webP.onload = function () {
    // 支持WebP，设置CSS变量为1
    setWebPSupport(true);
  };

  webP.onerror = function () {
    // 不支持WebP，设置CSS变量为0
    setWebPSupport(false);
  };

  // 设置一个简单的WebP图片进行测试
  // 这是一个1x1像素的WebP图片的base64编码
  webP.src =
    'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vx8AAA=';
})();
