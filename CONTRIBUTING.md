# 开发与维护

仓库已包含可加载的 JavaScript，不需要前端构建步骤。安装插件不需要运行下面的开发命令。

```sh
git clone https://github.com/xiaozhang040316/dsh-yanyu-purge.git
cd dsh-yanyu-purge
npm run check
```

生成分发包需要 Node.js/npm 与 Python 3：

```sh
python scripts/package.py
```

产物在 `dist/`：插件 ZIP、npm tgz 和 SHA-256 校验和。打包脚本依据 `package.json.files`，不会把工作区备份、日志或截图打入插件包。

修改 Host 代码后，在 DSH 中重新加载插件。验证四个方案、深浅主题、窄屏、键盘、失败重试和真实注入状态。`npm run check` 只做静态与资源检查，不替代宿主运行验证。

提交 Issue 时请附上 DSH 与插件版本、安装方式和复现步骤。
