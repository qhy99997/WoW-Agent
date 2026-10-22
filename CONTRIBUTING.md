# Contributing to WoW

[中文版](CONTRIBUTING.zh-CN.md)

Thanks for taking the time to contribute! This project moves quickly, and thoughtful contributions from the community are what keep it sharp. The guide below walks you through how we work so your PR has the best chance of landing smoothly.

## Before You Start

WoW already has opinions on desktop UX, agent workflows, and public APIs. If your change shifts that direction, open an issue first so we can align before you invest time in a PR.

We hold AI-assisted contributions to the same standard as hand-written ones. **You should understand what you submit** — what changed, how it behaves at the edges, and why it fits this codebase. If you cannot explain that, the PR is not ready for review.

We only merge PRs aligned with the roadmap. Drive-by refactors without context are unlikely to land.

**External PRs are accepted for approved bug fixes only.** Open an issue first and wait for a maintainer to approve it with an `/approve` comment, then link that issue in your PR. PRs without an approved linked issue may be closed without review; once the issue is approved, ask a maintainer to reopen your PR.

**Discuss first** — open an issue before coding:

- Bug fixes, including small or typo-level ones: open a bug issue and wait for a maintainer's `/approve` before opening the PR
- New features or user-visible behavior changes (regardless of size): external feature PRs are not accepted — features are discussed and decided in issues, and accepted features are implemented by the team or by explicit maintainer invitation
- Refactors or other changes larger than ~100 lines
- Public API or compatibility changes

## Project Layout

This is a pnpm monorepo whose product is a desktop application:

- `apps/desktop` — the Electron application: `src/main` (main process, agent host, IPC), `src/preload` (context bridge), `src/renderer` (React UI), `src/shared` (IPC contract)
- `packages/agent-core-v2` — the agent engine
- `packages/node-sdk` — the SDK the desktop app drives the engine through
- `packages/klient`, `packages/kosong`, `packages/minidb`, `packages/oauth`, `packages/telemetry`, `packages/tree-sitter-bash` — supporting packages
- `plugins/` — a snapshot of upstream plugin marketplace sources; nothing reads it at runtime and it is not included in the installer

See [README.md](README.md) for the full project map and [AGENTS.md](AGENTS.md) for repository conventions.

## Development Setup

Prerequisites: Node.js >= 24.15.0, pnpm 10.33.0, Git.

```sh
git clone https://github.com/qhy99997/WoW-Agent.git
cd WoW-Agent
pnpm install
```

Useful scripts:

- `pnpm dev` — run the desktop app in dev mode
- `pnpm test` — run tests (vitest)
- `pnpm typecheck` — TypeScript check (note: builds packages first)
- `pnpm lint` — repo lint rules plus oxlint
- `pnpm lint:fix` — same, with auto-fix
- `pnpm build` — build all packages
- `pnpm run dist` — build everything and package the Windows installer

## Commit Convention

All commits and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/).

| Type     | Use for                                     | Example                                   |
|----------|---------------------------------------------|-------------------------------------------|
| feat     | A new feature                               | feat(agent-core-v2): add tool dedup       |
| fix      | A bug fix                                   | fix(desktop): keep transcript scrolled   |
| docs     | Documentation only                          | docs: clarify install instructions        |
| chore    | Tooling / housekeeping                      | chore: bump dependencies                  |
| refactor | Internal refactor without behavior change   | refactor(kosong): extract retry helper    |
| test     | Adding or improving tests                   | test(agent-core-v2): cover skill resolver |
| ci       | CI / build pipeline changes                 | ci: cache pnpm store                      |
| build    | Build system / artifact changes             | build(native): add win32-arm64 target     |
| perf     | Performance improvement                     | perf(session): batch event flushes        |
| style    | Formatting only (no logic)                  | style: apply oxlint --fix                 |

## Pull Requests

PR titles must follow [Conventional Commits](#commit-convention). This repository has no CI configured, so run `pnpm lint`, `pnpm typecheck`, and `pnpm test` locally before you ask for review. If your change alters user-visible behavior, update the user-facing documentation (`README.md`, `README.zh-CN.md`) in the same PR.

## Code Style

- TypeScript across the codebase.
- Linting via `oxlint` (config in `.oxlintrc.json`).
- Auto-formatting via `pnpm lint:fix`.
- Follow existing local patterns when the lint rules do not cover a style choice.

## Reporting Security Issues

Found a security issue? Please see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing to this repository, you agree that your contributions will be licensed under the [MIT License](LICENSE).
