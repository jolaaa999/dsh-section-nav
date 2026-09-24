# dsh-section-nav

[English](README.md) | [简体中文](README.zh.md)

一个 DeepSeek Harness 插件，把 **Section Nav for ChatGPT** 的体验带到 DSH Web 客户端：在当前助手回答旁显示轻量级章节导航栏，并把章节书签保存在浏览器本地。

> 本项目是 [Section-Nav-for-ChatGPT](https://github.com/scandishoper/Section-Nav-for-ChatGPT) 的 DSH 移植版，原作者 scandishoper，MIT 许可。ChatGPT 扩展适配层和扩展清单已替换为 DSH 适配层与 `dsh` 组合包清单。详见 [`NOTICE`](NOTICE) 与 [`LICENSE`](LICENSE)。

## 功能

- **当前回答章节栏** — 最新/当前正在阅读的助手回答中的标题会显示在聊天区旁边的导航栏中。
- **阅读位置追踪** — 当前章节跟随聊天区的阅读线高亮，切换逻辑与原扩展一致。
- **点击跳转** — 点击章节名称会滚动到对应标题，并短暂高亮目标。
- **本地章节书签** — 收藏任意章节，打开书签抽屉，之后随时跳回。
- **始终显示** — 根据聊天区旁的空间使用完整、紧凑或极简模式；理想位置放不下时，会把极简栏固定在视口边缘，而不是隐藏。
- **完整会话历史** — 只要 Host 还提供更早历史页，插件就会持续加载，并从最早加载的回合到最新尾部重建目录。
- **快速切换会话** — 每个访问过的会话目录都会缓存在内存中，切回时立即显示已有条目；Host 已无更多历史页时不会再次全量加载。
- **跟随主题** — 读取宿主页面的计算文字色与表面色，跟随 DSH 浅色/深色主题。
- **中英双语文案** — 通过 DSH locale 服务注册中文和英文字典。
- **不存服务器** — 书签保存在 `localStorage` 的 `dshSectionNav.bookmarks.v1` 键下，不会上传。

## 兼容性

插件面向 DSH Web 客户端的聊天 DOM 契约：

- 助手回答行：`[data-chat-flow-kind="assistant-step"]`
- 聊天区容器：`[data-chat-flow]`
- 回答稳定键：`data-chat-anchor-key` / `data-chat-flow-key`
- 轮次索引：`data-chat-turn`
- 标题：回答内容中的 `h1`、`h2`、`h3`，不包含思维链区域

它是纯浏览器端插件；Host 半部只提供 Loader 入口，全部功能都在 `lib/client.js`。

实现已在打包版 Oh-DSH 0.1.12 运行时（`@deepseek-ai/dsh` 0.1.2-alpha.3）上做过冒烟验证，并遵循当前 `0.1.x` Web/桌面版使用中的 DSH 客户端契约。

## 安装

### 从插件管理器安装

在 DSH 侧边栏打开 **Plugins**，点击 **Add plugin**，输入：

```text
github:jolaaa999/dsh-section-nav
```

### 使用 CLI 安装

```sh
dsh plugin --profile web add github:jolaaa999/dsh-section-nav
```

仓库已提交构建后的 `lib/` 产物，因此 git 安装不需要额外构建，也不需要授权安装脚本。

### 从本地目录安装

```sh
dsh plugin --profile web add .
```

请在仓库根目录执行。包的 manifest 声明了 `dsh.bundle.patch`，profile 会自动把 `dsh-section-nav` 加入插件层。

## 使用

1. 打开一个带 `#`、`##` 或 `###` 标题的 DSH 助手回答。
2. 章节栏始终显示：空间足够时显示完整/紧凑文字，否则退回为固定在视口边缘的极简栏。
3. 点击章节名称即可跳转。
4. 点击章节右侧星标可收藏/取消收藏。
5. 点击章节栏顶部的星标/数量按钮可打开书签抽屉。
6. 按 `Escape`、点击外部或点击关闭按钮可关闭抽屉。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

`pnpm run build` 先生成 ESM Host 半部到 `lib/index.js`，再构建浏览器半部到 `lib/client.js` 和 `lib/client.js.map`。

### 仓库结构

- `src/index.ts` —— Host 半部：无 Host 行为的 Loader 入口。
- `src/client/index.tsx` —— Cordis 客户端入口、服务注入和生命周期。
- `src/client/sectionNav.tsx` —— 控制器：挂载导航栏、追踪器、书签、会话切换重置与清理。
- `src/core/adapter.ts` —— DSH 聊天 DOM 适配层；唯一包含 DSH 选择器的文件。
- `src/core/*` —— 移植的章节解析、回答追踪、章节追踪、导航栏定位、书签、恢复和 DOM 变更监听逻辑。
- `src/client/components/*` —— React 导航栏与书签抽屉组件。
- `cordis.patch.yml` —— 注册插件行的 DSH 组合包层。
- `lib/` —— 提交到仓库的构建产物，供 git/tarball 安装使用。

## 配置

没有 DSH 配置项。插件刻意保持原扩展的使用方式，只持久化书签：

```js
localStorage['dshSectionNav.bookmarks.v1']
```

## 已知限制

- 当前目录条目来自用户回合；本版本没有重新启用助手标题解析。
- 视口非常窄时会退回为固定在边缘的极简栏，条目仍以标记形式可见；拉宽窗口即可显示完整标题。
- 当 Host 不再返回更早页面时，完整历史加载会停止；Host 无法提供的历史无法继续展开。
- 如果书签对应的回答不在当前已加载的会话窗口内，会显示“目标暂不可用”，直到对应历史加载出来。
- 思维链区域中的标题会被忽略；章节只属于助手回答正文。
- 不支持跨设备同步，也没有服务端存储。

## 插件市场元数据

建议的 GitHub 仓库 topic：

```text
dsh
deepseek-harness
dsh-plugin
plugin
ui
sidebar
navigation
bookmarks
```

本仓库的目标是能被扫描 GitHub 上 `dsh-plugin` / `deepseek-harness` topic 与 package manifest 的 DSH 插件目录收录。

## 许可证

MIT。本移植版保留原项目的版权与许可证声明；详见 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE)。
