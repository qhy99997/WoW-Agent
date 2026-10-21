import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  ApprovalHandler,
  ApprovalResponse,
  Event as AgentEvent,
  KimiHarness,
  QuestionHandler,
  QuestionResult,
  Session,
  SessionSummary as SdkSessionSummary,
} from '@moonshot-ai/kimi-code-sdk';

import { projectHistory } from './history';
import type {
  AddMcpServerInput,
  AddModelInput,
  ApprovalRequest,
  DoctorReport,
  McpServerSummary,
  McpTestOutcome,
  ModelOption,
  ProviderConfig,
  ProviderSummary,
  QuestionRequest,
  SessionSummary,
  SettingsSnapshot,
  StreamDelta,
  TranscriptEntry,
  Workspace,
} from '../shared/contract';

export interface EventSink {
  onDelta(delta: StreamDelta): void;
  onApproval(request: ApprovalRequest): void;
  onQuestion(request: QuestionRequest): void;
  onSessionChanged(): void;
}

const ANSI = /\u001B\[[0-9;]*m/g;
const WINDOWS_GIT_BASH = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/**
 * Owns the agent engine for the desktop app. The engine runs in the Electron
 * main process so the renderer only ever sees plain JSON over IPC.
 */
export class AgentHost {
  private harness: KimiHarness | null = null;
  private sink: EventSink | null = null;
  private starting: Promise<KimiHarness> | null = null;
  private readonly workspaces: Workspace[] = [];
  private readonly sessions = new Map<string, Session>();
  private readonly transcripts = new Map<string, TranscriptEntry[]>();
  private readonly pendingApprovals = new Map<string, (value: unknown) => void>();
  private readonly pendingQuestions = new Map<string, (value: unknown) => void>();

  get homeDir(): string {
    return process.env['WOW_HOME'] ?? join(homedir(), '.wow');
  }

  setSink(sink: EventSink | null): void {
    this.sink = sink;
  }

  async ensureStarted(): Promise<KimiHarness> {
    if (this.harness !== null) return this.harness;
    this.starting ??= (async () => {
      const sdk = await import('@moonshot-ai/kimi-code-sdk');
      const harness = sdk.createKimiHarness({
        homeDir: this.homeDir,
        uiMode: 'desktop',
        identity: {
          productName: 'WoW',
          version: process.env['WOW_VERSION'] ?? '0.1.0',
          platform: 'wow_desktop',
        },
      });
      this.harness = harness;
      return harness;
    })();
    return this.starting;
  }

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport['checks'] = [];
    const major = Number(process.versions.node.split('.')[0] ?? '0');
    checks.push({
      id: 'node',
      label: 'Node.js runtime',
      status: major >= 24 ? 'ok' : 'fail',
      detail: `v${process.versions.node}`,
      hint: major >= 24 ? undefined : 'WoW needs Node.js 24 or newer.',
    });

    if (process.platform === 'win32') {
      const shellPath = process.env['WOW_SHELL_PATH'] ?? WINDOWS_GIT_BASH.find((c) => existsSync(c));
      const found = shellPath !== undefined;
      checks.push({
        id: 'shell',
        label: 'Git Bash',
        status: found ? 'ok' : 'fail',
        detail: shellPath ?? 'not found',
        hint: found ? undefined : 'Install Git for Windows, or set WOW_SHELL_PATH to bash.exe.',
      });
    }

    checks.push({
      id: 'home',
      label: 'Data directory',
      status: 'ok',
      detail: this.homeDir,
    });

    return { ok: checks.every((check) => check.status !== 'fail'), checks };
  }

  /**
   * Workspaces are derived from session history rather than kept in memory: the
   * engine already persists every session's workDir, so this stays correct across
   * restarts without a second source of truth to keep in sync.
   */
  async listWorkspaces(): Promise<Workspace[]> {
    const sessions = await this.listSessions();
    const byPath = new Map<string, Workspace>();
    for (const workspace of this.workspaces) byPath.set(workspace.path, workspace);
    for (const session of sessions) {
      if (session.workDir === '' || byPath.has(session.workDir)) continue;
      byPath.set(session.workDir, toWorkspace(session.workDir));
    }
    return [...byPath.values()];
  }

  addWorkspace(path: string): Workspace {
    const existing = this.workspaces.find((workspace) => workspace.path === path);
    if (existing !== undefined) return existing;
    const workspace = toWorkspace(path);
    this.workspaces.push(workspace);
    return workspace;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const harness = await this.ensureStarted();
    const rows = await harness.listSessions();
    return rows.map((row) => toSummary(row));
  }

  async createSession(workDir: string): Promise<SessionSummary> {
    const harness = await this.ensureStarted();
    const session = await harness.createSession({ workDir });
    this.wire(session);
    return {
      id: session.id,
      title: 'New session',
      workDir,
      updatedAt: Date.now(),
      status: 'idle',
    };
  }

  private async ensureSession(sessionId: string): Promise<Session> {
    const live = this.sessions.get(sessionId);
    if (live !== undefined) return live;
    const harness = await this.ensureStarted();
    const resumed = await harness.resumeSession({ id: sessionId });
    this.wire(resumed);
    return resumed;
  }

  private wire(session: Session): void {
    this.sessions.set(session.id, session);
    if (!this.transcripts.has(session.id)) this.transcripts.set(session.id, []);

    const approvalHandler: ApprovalHandler = (request) =>
      new Promise<ApprovalResponse>((resolve) => {
        const id = request.toolCallId === '' ? randomUUID() : request.toolCallId;
        this.emitApproval(session.id, id, request);
        this.pendingApprovals.set(id, resolve as (value: unknown) => void);
      });

    const questionHandler: QuestionHandler = (request) =>
      new Promise<QuestionResult>((resolve) => {
        const id = request.id ?? randomUUID();
        const first = request.questions[0];
        this.sink?.onQuestion({
          id,
          sessionId: session.id,
          question: first?.question ?? '',
          options: first?.options.map((option) => option.label),
        });
        this.pendingQuestions.set(id, resolve as (value: unknown) => void);
      });

    session.setApprovalHandler(approvalHandler);
    session.setQuestionHandler(questionHandler);
    session.onEvent((event) => {
      this.handleEvent(session.id, event);
    });
  }

  private emitApproval(
    sessionId: string,
    id: string,
    request: Parameters<ApprovalHandler>[0],
  ): void {
    const display = request.display;
    const detail =
      display.kind === 'command'
        ? display.command
        : display.kind === 'file_io'
          ? `${display.operation} ${display.path}`
          : display.kind === 'diff'
            ? `diff ${display.path}`
            : display.kind === 'generic'
              ? display.summary
              : request.action;
    this.sink?.onApproval({
      id,
      sessionId,
      title: `${request.toolName}: ${request.action}`,
      detail,
      diff:
        display.kind === 'diff'
          ? `--- ${display.path}\n+++ ${display.path}\n- ${display.before}\n+ ${display.after}`
          : undefined,
      options: [
        { id: 'allow_once', label: '允许一次' },
        { id: 'allow_session', label: '本会话允许' },
        { id: 'reject', label: '拒绝' },
      ],
    });
  }

  private handleEvent(sessionId: string, event: AgentEvent): void {
    if (event.type === 'assistant.delta' || event.type === 'thinking.delta') {
      const text = stripAnsi('delta' in event ? String(event.delta) : '');
      if (text === '') return;
      const kind = event.type === 'thinking.delta' ? 'thinking' : 'text';
      this.appendDelta(sessionId, kind, text);
      return;
    }

    if (event.type === 'tool.call.started') {
      const entryId = 'toolCallId' in event ? String(event.toolCallId) : randomUUID();
      const name = 'name' in event ? String(event.name) : 'tool';
      const entry: TranscriptEntry = {
        id: entryId,
        role: 'tool',
        kind: 'tool-call',
        text: name,
        createdAt: Date.now(),
      };
      const entries = this.transcripts.get(sessionId) ?? [];
      entries.push(entry);
      this.transcripts.set(sessionId, entries);
      this.sink?.onDelta({
        sessionId,
        entryId,
        role: 'tool',
        kind: 'tool-call',
        text: name,
        done: true,
      });
      return;
    }

    if (event.type === 'turn.ended') {
      // Re-read the engine's canonical history once the turn settles, so the
      // local streaming cache is reconciled with what actually persisted
      // (tool calls, injected context, anything a delta stream cannot express).
      void this.resync(sessionId).finally(() => {
        this.sink?.onSessionChanged();
      });
    }
  }

  private async resync(sessionId: string): Promise<void> {
    try {
      await this.transcript(sessionId);
    } catch {
      // A closed session mid-teardown is not worth surfacing.
    }
  }

  private appendDelta(sessionId: string, kind: string, text: string): void {
    const entries = this.transcripts.get(sessionId) ?? [];
    const last = entries.at(-1);
    // A delta continues the previous bubble only when role AND kind match: a
    // user prompt also carries kind 'text', so matching on kind alone would
    // append the reply onto the user's own message.
    if (last !== undefined && last.role === 'assistant' && last.kind === kind) {
      last.text += text;
      this.sink?.onDelta({
        sessionId,
        entryId: last.id,
        role: 'assistant',
        kind,
        text,
        done: false,
      });
      return;
    }
    const entry: TranscriptEntry = {
      id: randomUUID(),
      role: 'assistant',
      kind,
      text,
      createdAt: Date.now(),
    };
    entries.push(entry);
    this.transcripts.set(sessionId, entries);
    this.sink?.onDelta({ sessionId, entryId: entry.id, role: 'assistant', kind, text, done: false });
  }

  respondApproval(approvalId: string, optionId: string): void {
    const resolve = this.pendingApprovals.get(approvalId);
    if (resolve === undefined) return;
    this.pendingApprovals.delete(approvalId);
    const decision = optionId === 'reject' ? 'rejected' : 'approved';
    resolve({ decision, scope: optionId === 'allow_session' ? 'session' : undefined });
  }

  respondQuestion(questionId: string, answer: string): void {
    const resolve = this.pendingQuestions.get(questionId);
    if (resolve === undefined) return;
    this.pendingQuestions.delete(questionId);
    resolve({ answers: { '0': answer } });
  }

  async sendPrompt(sessionId: string, text: string): Promise<void> {
    const session = await this.ensureSession(sessionId);
    // Echo the user's own message immediately so the composer feels responsive.
    // The engine's replayed context replaces the cache when the turn ends, so
    // this entry is transient by design and must not be appended to the cache.
    this.sink?.onDelta({
      sessionId,
      entryId: `pending-${randomUUID()}`,
      role: 'user',
      kind: 'text',
      text,
      done: true,
    });
    await session.prompt(text);
  }

  async cancelPrompt(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    await session?.cancel();
  }

  async transcript(sessionId: string): Promise<TranscriptEntry[]> {
    const session = await this.ensureSession(sessionId);
    const context = await session.getContext();
    const rebuilt = projectHistory(context.history);
    this.transcripts.set(sessionId, rebuilt);
    return [...rebuilt];
  }

  async deleteSession(sessionId: string): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.deleteSession(sessionId);
    this.transcripts.delete(sessionId);
    this.sessions.delete(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.renameSession({ id: sessionId, title });
  }

  async listModels(): Promise<ModelOption[]> {
    const harness = await this.ensureStarted();
    const config = await harness.getConfig();
    const models = config.models ?? {};
    return Object.entries(models).map(([alias, entry]) => ({
      alias,
      provider: entry.provider,
      displayName: entry.displayName ?? alias,
    }));
  }

  async settingsSnapshot(): Promise<SettingsSnapshot> {
    const harness = await this.ensureStarted();
    // The engine snapshots config.toml at boot; reload so a file edited outside
    // this process (or a previous run) is reflected instead of stale state.
    const config = await harness.getConfig({ reload: true });
    const models = config.models ?? {};
    const providers: ProviderSummary[] = Object.entries(config.providers ?? {}).map(
      ([name, entry]) => ({
        name,
        wireType: entry.type,
        baseUrl: entry.baseUrl,
        hasApiKey: (entry.apiKey ?? '') !== '',
        modelAliases: Object.entries(models)
          .filter(([, model]) => model.provider === name)
          .map(([alias]) => alias),
      }),
    );
    return {
      providers,
      models: Object.entries(models).map(([alias, entry]) => ({
        alias,
        provider: entry.provider,
        displayName: entry.displayName ?? alias,
      })),
      defaultModel: config.defaultModel,
    };
  }

  async upsertProvider(config: ProviderConfig): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.setConfig({
      providers: {
        [config.name]: {
          type: config.wireType,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        },
      },
    });
  }

  async removeProvider(name: string): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.removeProvider(name);
  }

  async addModel(input: AddModelInput): Promise<void> {
    const harness = await this.ensureStarted();
    const alias = `${input.provider}/${input.model}`;
    await harness.setConfig({
      models: {
        [alias]: {
          provider: input.provider,
          model: input.model,
          displayName: input.displayName ?? input.model,
          maxContextSize: input.maxContextSize ?? 128_000,
          capabilities: input.capabilities,
        },
      },
    });
    const config = await harness.getConfig();
    if (config.defaultModel === undefined) {
      await harness.setConfig({ defaultModel: alias });
    }
  }

  /**
   * `setConfig` deep-merges, so it cannot express "drop this key". Replacing the
   * whole `models` domain is the only way to delete a single alias.
   */
  async removeModel(alias: string): Promise<void> {
    const harness = await this.ensureStarted();
    const config = await harness.getConfig();
    const remaining = Object.fromEntries(
      Object.entries(config.models ?? {}).filter(([key]) => key !== alias),
    );
    await harness.replaceConfigSection(
      'models',
      Object.keys(remaining).length === 0 ? undefined : remaining,
    );
    if (config.defaultModel === alias) {
      const next = Object.keys(remaining)[0];
      if (next !== undefined) await harness.setConfig({ defaultModel: next });
    }
  }

  async deleteProvider(name: string): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.removeProvider(name);
  }

  async setDefaultModel(alias: string): Promise<void> {
    const harness = await this.ensureStarted();
    await harness.setConfig({ defaultModel: alias });
  }

  async setSessionModel(sessionId: string, modelAlias: string): Promise<void> {
    const session = await this.ensureSession(sessionId);
    await session.setModel(modelAlias);
  }

  async testProvider(config: ProviderConfig): Promise<{ ok: boolean; detail: string }> {
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: config.apiKey === undefined ? {} : { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok
        ? { ok: true, detail: `HTTP ${String(response.status)}` }
        : { ok: false, detail: `HTTP ${String(response.status)} ${response.statusText}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async listMcpServers(workDir?: string): Promise<McpServerSummary[]> {
    const harness = await this.ensureStarted();
    const servers = await harness.listMcpServers(workDir === undefined ? {} : { cwd: workDir });
    return servers.map((server) => ({
      name: server.name,
      transport: server.transport,
      detail:
        server.transport === 'stdio'
          ? [server.command, ...(server.args ?? [])].join(' ')
          : server.url,
      enabled: server.enabled !== false,
      mutable: server.mutable,
      source: String(server.source),
    }));
  }

  async addMcpServer(input: AddMcpServerInput, workDir?: string): Promise<McpServerSummary[]> {
    const harness = await this.ensureStarted();
    const base = { name: input.name, enabled: true };
    let server: Parameters<typeof harness.addMcpServer>[0];
    if (input.transport === 'stdio') {
      if (input.command === undefined || input.command === '') {
        throw new Error('stdio transport needs a command');
      }
      server = {
        ...base,
        transport: 'stdio',
        command: input.command,
        args: input.args,
        env: input.env,
      };
    } else {
      if (input.url === undefined || input.url === '') {
        throw new Error(`${input.transport} transport needs a url`);
      }
      server = {
        ...base,
        transport: input.transport,
        url: input.url,
        headers: input.headers,
      };
    }
    await harness.addMcpServer(server, workDir === undefined ? {} : { cwd: workDir });
    return this.listMcpServers(workDir);
  }

  async removeMcpServer(name: string, workDir?: string): Promise<McpServerSummary[]> {
    const harness = await this.ensureStarted();
    await harness.removeMcpServer(name, workDir === undefined ? {} : { cwd: workDir });
    return this.listMcpServers(workDir);
  }

  async testMcpServer(input: AddMcpServerInput, workDir?: string): Promise<McpTestOutcome> {
    const harness = await this.ensureStarted();
    const base = { name: input.name, enabled: true };
    const server =
      input.transport === 'stdio'
        ? {
            ...base,
            transport: 'stdio' as const,
            command: input.command ?? '',
            args: input.args,
            env: input.env,
          }
        : {
            ...base,
            transport: input.transport,
            url: input.url ?? '',
            headers: input.headers,
          };
    const result = await harness.testMcpServerConfig(
      server,
      workDir === undefined ? {} : { cwd: workDir },
    );
    return {
      ok: result.success,
      detail: result.output === '' ? (result.success ? 'connected' : 'failed') : result.output,
    };
  }

  async dispose(): Promise<void> {
    await this.harness?.close();
    this.harness = null;
    this.starting = null;
  }
}

function toSummary(row: SdkSessionSummary): SessionSummary {
  return {
    id: row.id,
    title: row.title ?? row.lastPrompt ?? 'Untitled',
    workDir: row.workDir,
    updatedAt: row.updatedAt,
    status: row.lastTurnReason ?? 'idle',
  };
}

/**
 * A stable id derived from the path, so a workspace keeps the same identity
 * across restarts (the renderer uses it as a React key and to highlight the
 * active workspace).
 */
function toWorkspace(path: string): Workspace {
  return {
    id: path,
    path,
    name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
  };
}
