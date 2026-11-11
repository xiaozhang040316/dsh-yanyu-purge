<p align="center">
  <img src="icon.svg" width="88" height="88" alt="燕子 · 破甲工作台" />
</p>

<h1 align="center">燕子 · 破甲工作台</h1>

<p align="center"><strong>把系统提示词，变成你的主场。</strong></p>
<p align="center">四燕就位，指令由你定义。方案切换、system 覆盖与追加、本地请求确认，一处掌控。</p>

<p align="center">
  <a href="https://github.com/xiaozhang040316/dsh-yanyu-purge/releases/latest">下载最新版</a> ·
  <a href="docs/INSTALL.md">安装与使用</a> ·
  <a href="https://yanyuapi.com/">燕语 FreeCoding</a> ·
  <a href="https://qm.qq.com/q/AgbEXUorUA">加入交流群</a>
</p>

<p align="center">
  <a href="https://github.com/xiaozhang040316/dsh-yanyu-purge/releases"><img alt="Release" src="https://img.shields.io/github/v/release/xiaozhang040316/dsh-yanyu-purge?color=bf3623" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-0c1d40" /></a>
  <a href="https://github.com/topics/dsh-plugin"><img alt="DSH plugin" src="https://img.shields.io/badge/DSH-Plugin-336caa" /></a>
</p>

---

**燕子 · 破甲工作台**，为 **DeepSeek Harness（DSH）** 打造的系统提示词控制台。红黄蓝绿四套方案一键切换，覆盖与追加按需配置，方案切换后下一次请求即刻生效。从选择方案到进入本地 `system` 请求，每一步都有状态可查。朱砂燕子、靛青界面，让你的提示词有专属席位，让每一次切换有迹可循。

## 看一眼，就会用

![破甲工作台浅色预览](docs/images/desktop.png)

<details>
<summary>查看深色与窄屏布局</summary>

![深色预览](docs/images/dark.png)

<img src="docs/images/mobile.png" width="320" alt="窄屏预览" />

</details>

截图为真实客户端在本地演示容器中的布局，使用合成状态数据；实际颜色跟随 DSH 主题。

## 四只燕子，各有主场

| 方案 | 侧重点 |
|---|---|
| **红燕子** | 中文表达 |
| **黄燕子** | 英文表达 |
| **蓝燕子** | 执行规范 |
| **绿燕子** | 通道工作规范 |

点击即可切换，**下一次请求生效，无需重启**。面板只呈现方案与状态，提示词正文保存在独立资源文件中。

## 从方案到请求，一处掌控

- **直达 system 层，定义工作方式。** 新安装默认使用 `purge`，以当前方案替换 DSH 组装后的系统提示词段；也支持 `inject` 追加模式。
- **每一次确认，都有记录。** 区分面板连接、提示词注册、正文读取与本地请求确认，成功记录带时间，不把“面板亮了”当作“注入成功”。
- **朱砂为印，靛青为底。** 朱砂燕子、靛青底色与中文衬线标题，沿用燕语 FreeCoding 的视觉语言；正文区跟随 DSH 深浅主题，窄面板自动调整布局。
- **切得顺手，用得踏实。** 切换中锁定重复操作，失败保留已确认选择；复制链接在写入完成后才显示成功，支持键盘选择。
- **入口就在手边。** 官网、复制链接与 QQ 交流群集成在同一面板。

## 在线安装

在 DSH 的 **插件 → 安装** 中粘贴以下 Git 安装地址：

```text
git+https://github.com/xiaozhang040316/dsh-yanyu-purge.git#v1.3.1
```

安装完成后启用 **燕子 · 破甲工作台**，按宿主提示重载。GitHub 下载不便时，使用下面的 ZIP 安装方式。

## 三步起飞

1. 从 [Releases 下载最新插件压缩包](https://github.com/xiaozhang040316/dsh-yanyu-purge/releases/latest)，解压到固定目录。
2. 在 DSH 的 **Plugins / 插件管理** 中安装本地插件，选择包含 `package.json` 的目录；按应用提示完成加载。
3. 打开侧栏 **破甲工作台**，选择一个方案，再发送一条新消息，查看注入状态。

完整安装步骤、更新方法和常见问题见 **[安装与使用教程](docs/INSTALL.md)**。

## 读懂状态，比猜测更直接

| 面板状态 | 表示什么 |
|---|---|
| 面板已连接 | 状态接口已经连通 |
| 已就绪，等待下一次请求 | 提示词段已经注册，尚无新请求确认 |
| 提示词已读取 | DSH 已调用当前正文提供函数 |
| 系统提示词覆盖 / 注入已确认 | 在本地模型请求的 `system` 消息中匹配到当前方案和模式，展示最近确认时间 |

面板可见时每 3 秒刷新一次。切换方案会清空旧确认记录；新记录需要下一次请求产生。确认记录描述本地请求内容，不代表远端模型的响应效果。

## 适配与实现

插件使用 DSH 的 `SystemPrompt`、`slots` 和本地 Web 服务，不修改 DSH 安装包。当前实现依赖宿主的 `complete` 提示词段与 `llm/stream` 扩展点。

- 宿主项目与安装说明：https://github.com/deepseek-ai/deepseek-harness
- 核心代码：`index.js`（Host）、`client.js`（Client）
- 提示词资源：`prompts/`
- 配置与加载：`cordis.patch.yml`

本次在 Windows 上的 DSH 桌面环境验证；安装包内相关宿主模块标记版本为 `0.2.1-rc.2`。其他发行版以实际加载结果为准。

具体兼容版本与本次变更以 [Release 说明](https://github.com/xiaozhang040316/dsh-yanyu-purge/releases/latest) 为准。

## 交流与反馈

**QQ 交流群：740438905**

[点击加入交流群](https://qm.qq.com/q/AgbEXUorUA) · [燕语 FreeCoding](https://yanyuapi.com/) · [提交 Issue](https://github.com/xiaozhang040316/dsh-yanyu-purge/issues)

反馈时附上 DSH 版本、插件版本、操作步骤和面板状态，便于复现。

<p align="center"><strong>一语即达，自在编码。</strong></p>

## 许可证与致谢

本项目以 [MIT](LICENSE) 许可证发布。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件机制开发；这是独立社区插件。安装与分发方式参照官方[插件管理说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.zh.md)与[插件索引说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md)。品牌视觉参考[燕语 FreeCoding](https://yanyuapi.com/)。
