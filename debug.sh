#!/bin/bash
# 使用 Node.js 调试器运行 UMI 开发服务器

# 确保脚本可执行
# chmod +x debug.sh

# 使用 --inspect-brk 标志启动 Node.js 调试器
# 这会在执行第一行代码前暂停，给你时间连接调试器
NODE_OPTIONS="--inspect-brk" npx umi dev

# 或者使用 --inspect 标志（不会在开始时暂停）
# NODE_OPTIONS="--inspect" npx umi dev