# Architecture

WoW Agent is a Windows desktop agent built as three cooperating TypeScript processes:

1. **Renderer** — React 19 + Zustand, sandboxed, no Node access.
2. **Preload** — a typed `window.wow` bridge over `ipcRenderer`.
3. **Main** — Electron/Node: the agent harness, model providers, tools, storage, and OS integration.

The split is deliberate: the model loop and file access never live in the renderer, so a UI reload cannot corrupt a run, and a compromised page cannot call `fs` directly.

## 1. Process and trust boundaries

```text
Renderer (sandboxed)
  React components ── Zustand store ── lib/bridge.ts
                                          │
                                          │ window.wow (contextBridge)
                                          ▼
Preload (contextIsolation, no Node in renderer)
  ipcRenderer.invoke/send ── typed WowApi
                                          │
                                          ▼
Main
  ipc.ts (validation + path guards)
    ├─ AgentRuntime
    │    ├─ permissions / approvals
    │    ├─ tools (fs, search, shell, web, plan, agent, knowledge)
    │    ├─ subagents
    │    ├─ compaction
    │    └─ hooks
    ├─ providers (OpenAI-compatible, Anthropic, demo)
    └─ services (sessions, settings, secrets, library, skills, tasks)
```

**Renderer trust level:** trusted UI, untrusted content. Markdown is rendered without raw HTML; external links open through a protocol-checked main-process handler. All IPC inputs are re-validated in main.

**Preload:** exposes only the operations in `WowApi` (`src/shared/types.ts`). There is no generic `invoke(channel, …)` escape hatch.

**Main:** the only process with filesystem, process, and network access.

## 2. Domain model

```ts
SessionDetail {
  id, title, workspace, model, permissionMode, workflowId
  history: AgentMessage[]        // canonical provider-agnostic context
  timeline: TimelineItem[]       // UI projection (messages, tools, plans, approvals…)
  todos, changes, allowedTools, usage, contextTokens, turnId
}
```

`history` is what the model sees. `timeline` is what the user sees. They are persisted together but serve different purposes:

- A tool call produces an assistant `history` message with `toolCalls`, a tool `history` message with the result, and a `ToolItem` in the timeline.
- Reasoning is stored in the timeline but **not** fed back into history.
- Subagent messages are in the timeline with an `agentId`; they are **not** in the parent’s `history`.
- Todo/approval/question cards are UI-only.

`TimelineItem` is a discriminated union: `message`, `reasoning`, `tool`, `todo`, `changes`, `agent`, `approval`, `question`, `notice`, `compaction`. The renderer switches on `kind`.

## 3. The agent loop

Implemented in `src/main/agent/runtime.ts`.

```text
send(sessionId, text)
  ├─ create RunState { AbortController, approvals, questions, readFiles }
  ├─ add user timeline item + history message (text + image/text attachments)
  ├─ UserPromptSubmit hook (may block)
  └─ runLoop(scope)
       for step in 0..maxSteps:
         ├─ resolve provider (enabled? key? context window)
         ├─ compact history if estimated tokens > contextWindow * compactAt
         ├─ build system prompt (tools, skills, workspace, mode, project instructions)
         ├─ stream provider
         │    ├─ text        → assistant timeline item + stream events
         │    ├─ reasoning   → reasoning item + stream events
         │    ├─ tool_call   → accumulate
         │    └─ usage       → session usage + contextTokens
         ├─ persist assistant message (text + tool calls)
         ├─ if no tool calls → done
         ├─ for each tool call:
         │    ├─ validate JSON + zod schema
         │    ├─ plan-mode block?
         │    ├─ approval required? → approval card → wait
         │    ├─ PreToolUse hook
         │    ├─ execute → tool card → tool history message
         │    └─ PostToolUse hook
         └─ persist
```

Key properties:

- **Streaming is incremental**: the renderer appends deltas to a message item; final updates replace the item with the complete content.
- **Tool execution is sequential** in the current release. This keeps approvals and file mutation deterministic. Parallel read-only tool calls are a roadmap item.
- **Abort** is cooperative: the provider request is aborted, foreground shell processes are killed, pending approvals resolve as denied, and pending questions resolve empty.
- **Step limit** comes from Settings (default 40). Subagents get 16 steps.
- **Usage** is accumulated per session. `contextTokens` uses the provider’s reported input tokens when available, with a character-based estimate as fallback.

## 4. Permissions

Risk classes live on each tool definition (`src/main/agent/tools/types.ts`):

| Risk | Examples | Ask mode | Plan mode |
| --- | --- | --- | --- |
| `read` | read_file, glob, grep, list_dir, web_fetch, knowledge_search, skill | auto | allowed |
| `network` | web_search, web_fetch | auto | allowed |
| `agent` | task (subagent) | auto | allowed |
| `write` | write_file, edit_file | approval | **blocked** |
| `execute` | bash, task_stop | approval | **blocked** |

Additional rules:

- `exit_plan_mode` always requires approval, in every mode.
- “Always allow” appends the tool name to `session.allowedTools`; subagents share that list.
- Plan mode enforcement happens in `executeTool`, before any approval prompt, so the prompt cannot be bypassed by the model.
- Subagents inherit the parent’s mode and approval list. A coder subagent in plan mode is also read-only.
- The approval card carries the tool name, risk, sanitized input, and reason. The full input is in history; the card shows a truncated preview.

## 5. Tools

`src/main/agent/tools/index.ts` is the registry. Main agent gets all tools; subagents get subsets:

| Tool | Risk | Notes |
| --- | --- | --- |
| `read_file` | read | Numbered lines, offset/limit, binary rejection, read tracker |
| `write_file` | write | Requires a prior read for existing files; hash check |
| `edit_file` | write | Exact replacement, unique match by default, hash check |
| `list_dir` | read | Shallow tree, caps |
| `glob` | read | fast-glob, .gitignore-aware, newest first |
| `grep` | read | Regex, skips binaries, secrets, deps, build output |
| `bash` | execute | Git Bash on Windows, timeout, background tasks |
| `task_list/output/stop` | read/execute | Background shell registry |
| `web_fetch` | network | HTML → text, size cap, http(s) only |
| `web_search` | network | Bing RSS with DuckDuckGo fallback |
| `todo_write` | read | Updates the visible plan |
| `exit_plan_mode` | read* | Always approval; switches to Ask |
| `task` | agent | Isolated subagent, no recursion |
| `ask_user` | read | 1–4 structured questions with options |
| `knowledge_search/save` | read | Local library |
| `skill` | read | Loads a `SKILL.md` body on demand |

### Read-before-write

`ToolRunContext.readFiles` maps absolute paths to content hashes. `read_file` records the hash. `write_file`/`edit_file` require:

1. a prior read in the same scope, and
2. the current on-disk hash to match the recorded hash.

If another process or the user changed the file, the tool returns an error and asks the model to read again. This prevents stale overwrites.

### File changes and checkpoints

Every successful write/edit calls `addChange`, which computes a unified diff and stores `before`/`after` (capped at 200 KB each) on the session, grouped by `turnId`. The timeline gets a `ChangesCard`. **Undo** re-checks that the current file still equals `after`, then restores `before` or deletes a created file. If the file changed since, that file is skipped.

### Shell

`TaskManager` spawns through Git Bash (`-lc`) when available, falling back to PowerShell. Foreground commands default to 60 s (max 5 min); background tasks return an id immediately. Output is capped, streamed to the UI, and written to `tasks/<id>.log`. Stop kills the process tree (`taskkill /T /F` on Windows).

## 6. Subagents

`spawnAgent` in the runtime:

- creates an `AgentCardItem` in the parent timeline with a `runId`;
- builds a **new history** containing only the task prompt;
- uses `toolsForAgent(type)`:
  - `explore` / `plan` — read-only tools;
  - `coder` — all tools except `task`, `ask_user`, `exit_plan_mode`;
- runs the same `runLoop` with `depth = 1` and `maxSteps = 16`;
- tags every nested timeline item with `agentId` / `agentName`;
- returns only the final assistant text as the parent’s tool result;
- prevents further delegation (`depth > 0` rejects `task`).

The UI groups nested items under the agent card by `runId`; they never appear as top-level conversation turns. Subagent usage counts toward the session’s token usage.

## 7. Context management

`src/main/agent/context.ts` estimates tokens (ASCII / 3.8 + wide characters). Before each main-agent model call:

- if history tokens exceed `contextWindow * compactAt` (default 72%), keep the newest tail (bounded by ~18% of the window, max 10 messages, never orphaning tool results) and summarize the rest with the same provider;
- the summary is a `system` message at the head of history;
- a `CompactionItem` records before/after tokens and the summary;
- if summarization fails or the provider is the offline demo, a deterministic trim summary is used.

Manual compaction is available from the task menu and command palette.

## 8. System prompt

`buildSystemPrompt` composes:

- identity, workspace, top-level listing, OS/date, model, permission mode;
- operating rules (inspect first, plan multi-step work, delegate, verify, no fabricated output);
- safety rules (untrusted repo/web content, secrets, destructive operations, workspace boundary);
- mode-specific plan instructions;
- tool catalogue and skill catalogue;
- `AGENTS.md`, `WOW.md`, `.wow/instructions.md`, `.agents/instructions.md` (capped, explicitly marked untrusted);
- active workflow hint;
- approved plan.

Subagent prompts are shorter and enforce isolated context, read-only vs coder permissions, and “final message is the entire result”.

## 9. Hooks

`.wow/hooks.json` supports `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`.

```json
{
  "PreToolUse": [
    { "matcher": "bash|write_file", "command": "node .wow/hooks/guard.mjs", "timeout": 10 }
  ]
}
```

The command receives JSON on stdin and environment variables (`WOW_EVENT`, `WOW_WORKSPACE`, `WOW_SESSION_ID`, `WOW_TOOL_NAME`). Exit code 2 blocks a `PreToolUse`; stdout/stderr is appended to the tool result. Hooks are disabled by a settings toggle and time out (default 15 s, max 120 s).

## 10. Providers

`src/main/agent/providers/`:

- **OpenAI-compatible** (`openai.ts`) — `/chat/completions` streaming, `stream_options.include_usage`, reasoning fields (`reasoning_content` / `reasoning`), incremental tool-call arguments, custom headers.
- **Anthropic** (`anthropic.ts`) — native Messages API, system/tool_use/tool_result conversion, `content_block_delta` streaming, input JSON accumulation, usage/cache tokens.
- **Demo** (`mock.ts`) — offline, deterministic, explains setup. No network.

`createProvider` selects by `ProviderView.kind`. API keys come from `SecretStore`, which encrypts values with Electron `safeStorage` (DPAPI on Windows) and stores them in `secrets.json`, separate from `settings.json`.

Provider presets are starting points; model ids and base URLs are editable. The `ping()` implementation uses the `/models` endpoint where available.

## 11. Persistence layout

```text
%APPDATA%\WoW Agent\
  settings.json          providers (no keys), defaults, theme, limits
  secrets.json           DPAPI-encrypted API keys
  window-state.json      bounds/maximized
  library.json           notes/artifacts
  skills\                user SKILL.md bundles
  tasks\<id>.log         background shell output
  sessions\<id>\session.json
```

Writes are atomic (temp file + rename). Sessions are saved after each user turn, each tool call, and at the end of a run. On boot, stale `running` sessions are reset to `idle`, and pending approvals/questions are marked `expired`/`cancelled` because their runtime resolver did not survive the restart. Timeline and change arrays are capped to keep files bounded.

## 12. Renderer organization

Vetta-inspired layout:

```text
TitleBar (frameless, drag region, window controls)
├─ Sidebar: new task, nav, date-grouped sessions, settings
├─ Main:
│   ├─ ChatHeader: title, workflow/workspace/model meta, context meter, canvas toggle
│   ├─ Timeline: messages, tool cards, plan, approvals, questions, agents, diffs
│   └─ Composer: attachments, workflow, model, mode, send/stop, slash menu
├─ Canvas (right, resizable):
│   ├─ Plan: todos, progress, approved plan
│   ├─ Changes: turn-grouped diffs, undo
│   ├─ Files: tree + preview (markdown/code/image/pdf/html)
│   └─ Terminal: background shell tasks + ANSI output
└─ Overlays: command palette, settings, toasts
```

State is a single Zustand store. Main-process events (`timeline:add/update`, `stream`, `session:update`, `run:state`, `tasks:update`, `settings:update`, `library:update`) are merged incrementally. Streaming appends deltas; final timeline updates replace the item.

The renderer can run without Electron via `lib/mockBridge.ts`, which seeds a realistic workspace and simulates a run with approval. This is used for visual QA and `npm run preview:web`.

## 13. IPC and path safety

- `ipcMain.handle` wraps every handler with error normalization.
- File preview/tree/open calls resolve the path and require it to be inside home, a recent workspace, or an active session workspace.
- Symlinks are resolved before the containment check.
- External URLs are restricted to `http(s)`.
- `contextIsolation` + `sandbox` mean the renderer cannot require Node modules.
- The preload exposes no raw channel names.

## 14. Testing

- `tests/unit.test.ts` — token formatting, diff stats, path traversal, SSE chunk splitting, session persistence.
- `tests/harness.test.ts` — real `AgentRuntime` + real stores + scripted provider:
  - tool loop and persistence;
  - approval → write → change record → revert;
  - plan-mode block;
  - subagent isolation;
  - stop during approval.

Run with `npm test`. Typecheck with `npm run typecheck`.

## 15. Known limitations / roadmap

- Sequential tool execution; parallel read-only calls are not yet enabled.
- No MCP client, ACP server, or remote control yet.
- No background subagents (foreground only); background shell tasks are supported.
- Automations/cron are not exposed in the UI.
- Knowledge library is full-text search, not embeddings.
- No code signing; SmartScreen warns on first run.
- Renderer bundle is ~1.9 MB (highlight.js + markdown + diff); route-level code splitting is a future optimization.
- Windows is the primary target; the shell adapter falls back to PowerShell and the rest is cross-platform in principle, but packaging is configured for Windows.

These are deliberate scope cuts for a coherent v0.1, not hidden behavior.
