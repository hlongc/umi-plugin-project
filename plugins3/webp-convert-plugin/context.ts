// 创建一个单例上下文
class MyLoaderContext {
  private static instance: MyLoaderContext;

  /** 已处理过的图片路径缓存 */
  public processedImagePaths: Set<string> = new Set();
  /** 临时创建的webp文件路径，后续需要删除 */
  public tempWebpFiles: Set<string> = new Set();

  static getInstance(): MyLoaderContext {
    if (!MyLoaderContext.instance) {
      MyLoaderContext.instance = new MyLoaderContext();
    }
    return MyLoaderContext.instance;
  }

  addTmpWebpFile(filePath: string): void {
    console.log(`添加临时文件: ${filePath}`);
    // 实现逻辑
    this.tempWebpFiles.add(filePath);
  }

  /** 遍历临时文件 */
  forEachTempWebpFile(
    beforeProcess: (tempWebpFiles: Set<string>) => void,
    processFn: (filePath: string) => void,

    afterProcess: () => void,
  ): void {
    if (this.tempWebpFiles.size > 0) {
      beforeProcess(this.tempWebpFiles);
      for (const filePath of this.tempWebpFiles) {
        processFn(filePath);
      }
      afterProcess();
    }
  }

  clearTempWebpFiles(): void {
    this.tempWebpFiles.clear();
  }

  existProcessedImage(filePath: string): boolean {
    return this.processedImagePaths.has(filePath);
  }

  addProcessedImage(filePath: string): void {
    this.processedImagePaths.add(filePath);
  }

  clearProcessedImage(): void {
    this.processedImagePaths.clear();
  }
}

export default MyLoaderContext.getInstance();
