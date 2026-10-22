# WoW

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

WoW is a desktop AI coding agent. Point it at a project directory, describe what you want, and it reads and edits files, runs shell commands, and asks for your approval before it acts.

It is a GUI application, not a terminal program, and it does not ask you to create an account: you bring your own model endpoint and API key.

## Features

- **Desktop application.** An Electron shell around a React UI (`apps/desktop`), with the agent engine running in the main process.
- **Workspace-scoped sessions.** Create, rename, and delete sessions from the sidebar. Transcripts are rebuilt from the engine's own session history, and workspaces are derived from persisted sessions, so both survive a restart.
- **Approval before it acts.** Tool calls that need consent appear as a card offering *allow once*, *allow for this session*, or *reject*. Concurrent requests are queued rather than allowed to collide.
- **Questions get answered.** `AskUserQuestion` prompts render as an interactive card, so a turn never hangs waiting for input it cannot receive.
- **Visible progress.** Replies stream in as Markdown; each tool call shows whether it succeeded or failed; turn failures and model retries surface as errors instead of silence. If the model goes quiet for too long, WoW says so and offers to stop the turn.
- **Bring your own model.** Add providers in Settings with a name, a wire protocol, a Base URL, and an API key. Presets cover OpenAI-compatible, Anthropic, Google Gemini, OpenAI Responses, and Kimi endpoints, and you can register a model ID alongside the provider. The active model can be switched per session. This API key is the only credential the app uses — there is no sign-in. The engine still carries a Kimi OAuth implementation from upstream, so engine messages may occasionally mention `/login`, which is not a command this app has.
- **MCP servers.** Add Model Context Protocol servers from Settings — either a stdio server (command plus arguments) or an HTTP endpoint — and test the configuration before relying on it.
- **Startup environment check.** On launch WoW verifies the Node.js runtime, Git Bash on Windows, and the data directory, and lists anything that needs fixing.

## Build and run

Prebuilt installers are not distributed from this repository; build one from source.

Requirements:

- Windows (x64) — this is currently the only installer target
- [Git for Windows](https://gitforwindows.org/) — WoW uses the Git Bash bundled with it as its shell
- Node.js ≥ 24.15.0 and pnpm 10.33.0

```sh
git clone https://github.com/qhy99997/WoW-Agent.git
cd WoW-Agent
pnpm install
```

Run the app in development mode:

```sh
pnpm dev
```

Build the Windows installer:

```sh
pnpm run dist
```

The installer is written to `apps/desktop/release/WoW-0.1.0-x64.exe`. It is an NSIS package: a per-user install that does not require administrator rights, and it creates desktop and Start-menu shortcuts.

## Getting started

1. Launch WoW. If the environment check fails, fix the items marked as needing repair and press **重新检查** (re-check).
2. Open **设置 → 模型** (Settings → Models) and add a provider: pick a protocol preset or a custom Base URL, then paste your API key. Add a model ID if the provider does not list one automatically.
3. Choose a project directory. WoW reads and writes files there, runs commands there, and asks for your approval before acting.
4. Describe the task in the composer and send it.

> The desktop interface is currently Chinese only (`<html lang="zh-CN">`).

## Configuration and data

WoW keeps everything under a single home directory:

| What | Where |
| --- | --- |
| Configuration | `~/.wow/config.toml` — providers, models, default model |
| MCP servers | `~/.wow/mcp.json` (user level, editable in Settings), plus the read-only `<project>/.mcp.json` and `<project>/.wow/mcp.json` |
| Sessions | `~/.wow/sessions/` |
| Logs | `~/.wow/logs/wow.log` |

Note that MCP server definitions are not part of `config.toml`; only their timeouts are. You normally edit providers and MCP servers through Settings rather than by hand, but the underlying files are plain TOML and JSON, and the app reloads them. The UI can only remove a server it owns at the user level; entries coming from the project-level files are read-only there.

Environment variables:

- `WOW_HOME` — use a different data directory instead of `~/.wow`.
- `WOW_SHELL_PATH` — path to `bash.exe`, read by the startup environment check when Git Bash is installed in a non-standard location.
- `KIMI_SHELL_PATH` — path to `bash.exe`, read by the agent engine when it launches shell commands. On a machine where Git Bash is not auto-detected, set both variables to the same absolute path.

## Develop

Requirements: Node.js ≥ 24.15.0, pnpm 10.33.0.

```sh
pnpm install
pnpm dev             # run the desktop app in dev mode
pnpm test            # run the test suite (vitest)
pnpm typecheck       # TypeScript check (builds packages first)
pnpm lint            # repo lint rules + oxlint
pnpm build           # build all packages
pnpm run dist        # build everything and package the Windows installer
```

Additional scripts: `pnpm build:packages`, `pnpm dev:packages`, `pnpm test:watch`, `pnpm test:coverage`, `pnpm lint:fix`, `pnpm clean`.

## Project layout

- `apps/desktop` — the Electron application: `src/main` (main process, agent host, IPC), `src/preload` (context bridge), `src/renderer` (React UI), `src/shared` (IPC contract).
- `packages/agent-core-v2` — the agent engine.
- `packages/node-sdk` — the SDK the desktop app drives the engine through.
- `packages/klient`, `packages/kosong`, `packages/minidb`, `packages/oauth`, `packages/telemetry`, `packages/tree-sitter-bash` — supporting packages.
- `plugins/` — an upstream snapshot of the kimi-code plugin marketplace sources. Nothing in this repository reads it at runtime, and it is not included in the installer.

See [AGENTS.md](AGENTS.md) for repository conventions.

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## Acknowledgements

WoW is derived from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code), the MIT-licensed Kimi Code CLI. The agent engine, the SDK, and the supporting packages come from that project, and the bundled plugins originate there as well.

## License

Released under the [MIT License](LICENSE). The license retains the upstream copyright notice alongside WoW's own, as the MIT terms require for derived work.