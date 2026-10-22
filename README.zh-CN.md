# WoW

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

WoW 是一个桌面端 AI 编程 agent。指定一个项目目录，用自然语言描述你想做的事，它就会读写文件、执行 shell 命令，并在动手之前征求你的同意。

它是一个图形界面应用，不是终端程序，也不需要注册账号：模型端点和 API Key 由你自己提供。

## 核心特性

- **桌面应用。** Electron 外壳 + React 界面（`apps/desktop`），agent 引擎跑在主进程里。
- **按工作区组织的会话。** 在侧边栏新建、重命名、删除会话。对话记录由引擎自己的会话历史重建，工作区也由已持久化的会话推导而来，因此重启之后依然完整。
- **动手前先征求同意。** 需要授权的工具调用会弹出一张卡片，提供「允许一次」「本会话允许」「拒绝」三个选项；并发的授权请求会排队，不会互相顶掉。
- **提问能被回答。** `AskUserQuestion` 会渲染成可交互的卡片，不会出现一轮对话卡死在等待输入上的情况。
- **进度可见。** 回复以 Markdown 流式呈现；每个工具调用都会标明成功还是失败；轮次失败和模型重试会作为错误暴露出来，而不是悄无声息地卡住。如果模型长时间没有输出，WoW 会提示你，并允许你中止这一轮。
- **自带模型。** 在设置里添加 Provider：名称、协议、Base URL、API Key。预设覆盖 OpenAI 兼容、Anthropic、Google Gemini、OpenAI Responses 和 Kimi 端点，也可以同时注册一个模型 ID。当前模型可以按会话切换。这个 API Key 是应用使用的唯一凭据，不需要登录。引擎里仍保留着上游的 Kimi OAuth 实现，因此引擎消息偶尔会提到 `/login`——本应用并没有这个命令。
- **MCP 服务器。** 在设置里添加 Model Context Protocol 服务器——支持 stdio（命令 + 参数）或 HTTP 端点——并且可以在真正使用之前先测试配置是否可用。
- **启动环境检查。** 启动时会检查 Node.js 运行环境、Windows 上的 Git Bash 以及数据目录，并把需要处理的问题列出来。

## 构建与运行

本仓库不提供预编译安装包，请从源码构建。

环境要求：

- Windows（x64）——目前仅提供这一个安装包目标
- [Git for Windows](https://gitforwindows.org/)——WoW 使用其中的 Git Bash 作为 Shell
- Node.js ≥ 24.15.0、pnpm 10.33.0

```sh
git clone https://github.com/qhy99997/WoW-Agent.git
cd WoW-Agent
pnpm install
```

以开发模式运行：

```sh
pnpm dev
```

构建 Windows 安装包：

```sh
pnpm run dist
```

安装包输出到 `apps/desktop/release/WoW-0.1.0-x64.exe`。它是 NSIS 安装包：按用户安装，不需要管理员权限，会创建桌面和开始菜单快捷方式。

## 快速开始

1. 启动 WoW。如果环境检查未通过，处理标记为「需修复」的项目，然后点「重新检查」。
2. 打开**设置 → 模型**，添加一个 Provider：选一个协议预设，或填入自定义 Base URL，再粘贴 API Key。如果该服务不会自动列出模型，顺便填一个模型 ID。
3. 选择一个项目目录。WoW 会在其中读写文件、执行命令，并在动手前征求你的同意。
4. 在输入框里描述任务并发送。

> 桌面界面以中文为主，少数字段标签（如 `Base URL`、`API Key`）保留英文（`<html lang="zh-CN">`）。

## 配置与数据

WoW 把全部数据放在同一个主目录下：

| 内容 | 位置 |
| --- | --- |
| 配置 | `~/.wow/config.toml`——Provider、模型、默认模型 |
| MCP 服务器 | `~/.wow/mcp.json`（用户级，可在设置界面编辑），以及只读的 `<project>/.mcp.json` 和 `<project>/.wow/mcp.json` |
| 会话 | `~/.wow/sessions/` |
| 日志 | `~/.wow/logs/wow.log` |

注意：MCP 服务器的定义不在 `config.toml` 里，那里只有它们的超时设置。Provider 和 MCP 服务器通常在设置界面里维护，不必手改文件；底层是普通的 TOML / JSON 文件，应用会重新加载它们。界面只能删除用户级的服务器，来自项目级文件的条目在界面里是只读的。

环境变量：

- `WOW_HOME`——改用其他数据目录，默认 `~/.wow`。
- `WOW_SHELL_PATH`——`bash.exe` 的绝对路径，启动时的环境检查与 agent 引擎启动 shell 命令时都会读取它。Git Bash 装在非标准路径时请设置它。
- `KIMI_SHELL_PATH`——同一个设置改名前的名字，未设置 `WOW_SHELL_PATH` 时仍会作为回退被接受。

## 本地开发

环境要求：Node.js ≥ 24.15.0，pnpm 10.33.0。

```sh
pnpm install
pnpm dev             # 以开发模式运行桌面应用
pnpm test            # 运行测试（vitest）
pnpm typecheck       # TypeScript 检查（会先构建各包）
pnpm lint            # 仓库自查规则 + oxlint
pnpm build           # 构建所有包
pnpm run dist        # 构建全部内容并打包 Windows 安装包
```

其他脚本：`pnpm build:packages`、`pnpm dev:packages`、`pnpm test:watch`、`pnpm test:coverage`、`pnpm lint:fix`、`pnpm clean`。

## 目录结构

- `apps/desktop`——Electron 应用：`src/main`（主进程、agent host、IPC）、`src/preload`（context bridge）、`src/renderer`（React 界面）、`src/shared`（IPC 契约）。
- `packages/agent-core-v2`——agent 引擎。
- `packages/node-sdk`——桌面应用用来驱动引擎的 SDK。
- `packages/klient`、`packages/kosong`、`packages/minidb`、`packages/oauth`、`packages/telemetry`、`packages/tree-sitter-bash`——配套包。
- `plugins/`——kimi-code 插件市场源码的上游快照。本仓库运行时不会读取它，安装包也不包含它。

仓库约定见 [AGENTS.md](AGENTS.md)。

## 安全

安全漏洞反馈，请见 [SECURITY.md](SECURITY.md)。

## 致谢

WoW 派生自 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)，即 MIT 协议下的 Kimi Code CLI。agent 引擎、SDK 及配套包均来自该项目，`plugins/` 下的插件源码同样源自该项目。

## 许可证

基于 [MIT](LICENSE) 协议发布。按照 MIT 对衍生作品的要求，许可证中在 WoW 自己的版权声明之外，仍保留了上游的版权声明。