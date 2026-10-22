# 为 WoW 贡献代码

[English version](CONTRIBUTING.md)

感谢你花时间参与贡献！这个项目迭代很快，离不开社区认真的贡献。下面的指南介绍我们的工作方式，帮助你的 PR 顺利合入。

## 开始之前

WoW 对桌面端交互、agent 工作流和公开 API 已有自己的主张。如果你的改动会改变这些方向，请先开 issue 对齐，再投入时间写 PR。

我们对 AI 辅助贡献与手写代码一视同仁。**你应该理解自己提交的内容**——改了什么、边界情况下表现如何、为什么适合这个代码库。如果你解释不清楚，这个 PR 就还没准备好接受评审。

我们只合入与路线图一致的 PR。缺乏上下文背景的顺手重构很难被接受。

**外部 PR 仅接受获批准的 bug 修复。** 先开 issue，等待维护者以 `/approve` 评论明确批准，然后在 PR 中链接该 issue。没有已批准关联 issue 的 PR 可能会不经评审直接关闭；issue 获批后，可联系维护者重开你的 PR。

**先讨论**——写代码前先开 issue：

- bug 修复（包括小的、错别字级别的）：先开 bug issue，等待维护者 `/approve` 后再提 PR
- 新功能或用户可见的行为变更（无论大小）：不接受外部 feature PR——功能在 issue 中讨论和决定，被接受的功能由团队实现，或由维护者明确邀请你贡献
- 重构或其他超过约 100 行的改动
- 公开 API 或兼容性变更

## 项目结构

本仓库是 pnpm monorepo，产物是一个桌面应用：

- `apps/desktop` — Electron 桌面应用：`src/main`（主进程、agent host、IPC）、`src/preload`（context bridge）、`src/renderer`（React 界面）、`src/shared`（IPC 契约）
- `packages/agent-core-v2` — agent 引擎
- `packages/node-sdk` — 桌面应用驱动引擎所用的 SDK
- `packages/klient`、`packages/kosong`、`packages/minidb`、`packages/oauth`、`packages/telemetry`、`packages/tree-sitter-bash` — 配套包
- `plugins/` — 上游插件市场源码的快照；本仓库运行时不读取它，安装包也不包含它

完整项目地图见 [README.md](README.md)，仓库约定见 [AGENTS.md](AGENTS.md)。

## 开发环境

前置要求：Node.js >= 24.15.0、pnpm 10.33.0、Git。

```sh
git clone https://github.com/qhy99997/WoW-Agent.git
cd WoW-Agent
pnpm install
```

常用脚本：

- `pnpm dev` — 开发模式运行桌面应用
- `pnpm test` — 运行测试（vitest）
- `pnpm typecheck` — TypeScript 检查（注意：会先构建各包）
- `pnpm lint` — 仓库 lint 规则 + oxlint
- `pnpm lint:fix` — 同上，带自动修复
- `pnpm build` — 构建全部包
- `pnpm run dist` — 构建全部并打包 Windows 安装程序

## 提交规范

所有 commit 和 PR 标题必须遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

| 类型     | 用途                                     | 示例                                   |
|----------|------------------------------------------|----------------------------------------|
| feat     | 新功能                                   | feat(agent-core-v2): add tool dedup       |
| fix      | bug 修复                                 | fix(desktop): keep transcript scrolled   |
| docs     | 仅文档                                   | docs: clarify install instructions     |
| chore    | 工具 / 杂务                              | chore: bump dependencies               |
| refactor | 无行为变更的内部重构                     | refactor(kosong): extract retry helper |
| test     | 新增或改进测试                           | test(agent-core-v2): cover skill resolver |
| ci       | CI / 构建流水线变更                      | ci: cache pnpm store                   |
| build    | 构建系统 / 产物变更                      | build(native): add win32-arm64 target  |
| perf     | 性能优化                                 | perf(session): batch event flushes     |
| style    | 仅格式化（无逻辑变更）                   | style: apply oxlint --fix              |

## Pull Requests

PR 标题必须遵循 [Conventional Commits](#提交规范)。本仓库没有配置 CI，请在请求评审前自行运行 `pnpm lint`、`pnpm typecheck` 和 `pnpm test`。如果改动影响用户可见行为，请在同一个 PR 中更新面向用户的文档（`README.md`、`README.zh-CN.md`）。

## 代码风格

- 全仓库 TypeScript。
- 使用 `oxlint`（配置见 `.oxlintrc.json`）。
- 用 `pnpm lint:fix` 自动修复（即仓库 lint 规则加 `--fix`；本仓库没有单独配置格式化工具）。
- lint 规则未覆盖的风格选择，跟随周边现有写法。

## 报告安全问题

发现安全问题？请查看 [SECURITY.md](SECURITY.md)，不要开公开 issue。

## 许可证

向本仓库贡献即表示你同意你的贡献按 [MIT 许可证](LICENSE) 授权。
