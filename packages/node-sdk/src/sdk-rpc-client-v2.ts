/**
 * The engine-backed `SDKRpcClientBase`: bootstraps agent-core-v2 in-process
 * and serves every SDK operation straight from the engine's services. Events
 * and the approval / question bridge come from the per-session wiring
 * (`src/v2/session-wiring.ts`); the one host-visible fact the engine publishes
 * on the process-global `IEventService` (`session.meta.updated`) is forwarded
 * from a constructor subscription.
 */
import {
  agentContextOf,
  bootstrap,
  closeSessionById,
  DEFAULT_AGENT_PROFILE_NAME,
  drainLogCloses,
  drainQueryStoreDisposals,
  drainSessionIndexMirror,
  ensureKimiHome,
  ensureMainAgent,
  followSessionLifecycles,
  getLiveSessionById,
  IAgentContextMemoryService,
  IAgentLifecycleService,
  IAgentLoopService,
  IAgentProfileService,
  IAgentPromptChannel,
  IBootstrapService,
  IConfigService,
  IEventService,
  IMcpManagementService,
  IMcpOAuthService,
  IModelService,
  IProviderService,
  ISessionActivityView,
  ISessionContext,
  ISessionIndex,
  ISessionIndexMirror,
  ISessionManager,
  ISessionMetadata,
  ISessionTokenCountingService,
  ISessionWorkspaceContext,
  IWorkspaceService,
  logSeed,
  ProfileError,
  ProfileErrors,
  resolveConfigPath,
  resolveKimiHome,
  resolveLoggingConfig,
  resumeSessionById,
  sessionDirOf,
  workspacePersistenceScope,
  type IAgentScopeHandle,
  type IDisposable,
  type ISessionScopeHandle,
  type McpManagedServer,
  type Scope,
  type ServicesAccessor,
  type SessionSummary as EngineSessionSummary,
} from '@moonshot-ai/agent-core-v2';
import { IAppendLogStore } from '@moonshot-ai/agent-core-v2/persistence/interface/appendLogStore';
import { assertKimiHostIdentity, createKimiDefaultHeaders } from '@moonshot-ai/kimi-code-oauth';

import type { AgentContextData } from '#/context';
import { ErrorCodes, KimiError } from '#/errors';
import { KimiHarness } from '#/kimi-harness';
import {
  SDKRpcClientBase,
  type SessionIdRpcInput,
  type SessionPromptRpcInput,
  type SetSessionModelRpcInput,
  type SetSessionModelRpcResult,
} from '#/rpc';
import type {
  CreateSessionOptions,
  GetConfigOptions,
  JsonObject,
  KimiConfig,
  KimiConfigPatch,
  KimiHarnessOptions,
  KimiHostIdentity,
  McpManagedServerInfo,
  McpServerConfig,
  McpServerOptions,
  McpTestResult,
  RenameSessionInput,
  ResumeSessionInput,
  SessionSummary,
} from '#/types';
import { planProviderRemoval, resolvedConfigToKimiConfig } from '#/v2/config-mapper';
import { translateGlobalEvent } from '#/v2/event-mapper';
import { normalizeWorkDir, v2SummaryToSessionSummary } from '#/v2/session-mapper';
import { SessionEventWiring } from '#/v2/session-wiring';

export class SDKRpcClientV2 extends SDKRpcClientBase {
  readonly homeDir: string;
  readonly configPath: string;
  readonly identity: KimiHostIdentity;

  private readonly app: Scope;
  /**
   * The config reads (`getAll` / `inspect`) are synchronous over state that
   * only exists once the initial load settles, so every config method awaits
   * this first.
   */
  private readonly configReady: Promise<void>;
  /**
   * The model / provider registries share the config service's ready trap;
   * binding the main agent's profile reads them, so agent operations await
   * this before touching a profile.
   */
  private readonly modelReady: Promise<void>;
  /** Event / interaction wiring per live session, dropped on every close path. */
  private readonly sessionWirings = new Map<string, SessionEventWiring>();
  /**
   * Per-session serialization for the operations that change a session's
   * live ownership (resume / close / delete and the temporary
   * resume→act→close of a rename), so a caller can never receive a handle
   * whose close is already in flight.
   */
  private readonly sessionAccessQueues = new Map<string, Promise<void>>();
  private readonly appSubscriptions: IDisposable[] = [];

  constructor(options: KimiHarnessOptions) {
    super();
    this.identity = assertKimiHostIdentity(options.identity);
    this.homeDir = resolveKimiHome(options.homeDir);
    this.configPath = resolveConfigPath({ homeDir: this.homeDir });
    ensureKimiHome(this.homeDir);

    const { app } = bootstrap(
      {
        homeDir: this.homeDir,
        configPath: this.configPath,
        clientIdentity: this.identity,
        args: {
          // Host identity headers for the engine's outbound requests (model,
          // URL fetch, registry refresh).
          requestHeaders: createKimiDefaultHeaders({ homeDir: this.homeDir, ...this.identity }),
        },
      },
      [...logSeed(resolveLoggingConfig({ homeDir: this.homeDir, env: process.env }))],
    );
    this.app = app;
    this.configReady = app.accessor.get(IConfigService).ready;
    this.modelReady = Promise.all([
      this.configReady,
      app.accessor.get(IModelService).ready,
      app.accessor.get(IProviderService).ready,
    ]).then(() => undefined);
    this.appSubscriptions.push(
      app.accessor.get(IEventService).subscribe((event) => {
        const translated = translateGlobalEvent(event);
        if (translated !== undefined) this.receiveEvent(translated);
      }),
      // A session closed without going through this client (an
      // engine-initiated close) drops its wiring with the scope.
      followSessionLifecycles(app.accessor, (service) =>
        service.onDidCloseSession((closed) => {
          this.unwireSession(closed.sessionId);
        }),
      ),
    );
  }

  /** The engine's App-scope service accessor (in-process only; used by tests). */
  get engineAccessor(): ServicesAccessor {
    return this.app.accessor;
  }

  async close(): Promise<void> {
    for (const wiring of this.sessionWirings.values()) {
      wiring.dispose();
    }
    this.sessionWirings.clear();
    for (const subscription of this.appSubscriptions) {
      subscription.dispose();
    }
    // Drain the session-index mirror while the query store is still open,
    // then await the asynchronous closes that disposal fires — a host that
    // removes homeDir right after close() must not race an in-flight close.
    await this.app.accessor.get(ISessionIndexMirror).drain();
    // Awaited before dispose(): the accessor throws once the scope is
    // disposed, and shutdown() is idempotent.
    await this.app.accessor.get(IMcpOAuthService).shutdown();
    const appendLogStore = this.app.accessor.get(IAppendLogStore);
    this.app.dispose();
    await appendLogStore.drainRetirements();
    await drainSessionIndexMirror();
    await drainQueryStoreDisposals();
    await drainLogCloses();
  }

  // -- config ---------------------------------------------------------------

  override async getConfig(options?: GetConfigOptions): Promise<KimiConfig> {
    const config = await this.config();
    if (options?.reload) {
      await config.reload();
    }
    return resolvedConfigToKimiConfig(clone(config.getAll()));
  }

  /** Deep-merges each top-level field of the patch into its config domain. */
  override async setConfig(patch: KimiConfigPatch): Promise<KimiConfig> {
    const config = await this.config();
    for (const [domain, domainPatch] of Object.entries(patch)) {
      if (domainPatch === undefined) continue;
      await config.set(domain, clone(domainPatch));
    }
    return this.getConfig();
  }

  override async replaceConfigSection(domain: string, value: unknown): Promise<KimiConfig> {
    const config = await this.config();
    await config.replace(domain, value === undefined ? null : clone(value));
    return this.getConfig();
  }

  /**
   * Removes the provider, every model pointing at it, and the default
   * pointers that would dangle — computed from the user-layer values and
   * persisted as one multi-section replace, so the file never ends up
   * half-cascaded.
   */
  override async removeProvider(providerId: string): Promise<KimiConfig> {
    const config = await this.config();
    const plan = planProviderRemoval({
      providers: clone(config.inspect<Record<string, unknown>>('providers').userValue),
      models: clone(config.inspect<Record<string, Record<string, unknown>>>('models').userValue),
      defaultModel: config.inspect<string>('defaultModel').userValue,
      defaultProvider: config.inspect<string>('defaultProvider').userValue,
      providerId,
    });
    const sections: Record<string, unknown> = {
      providers: plan.providers,
      models: plan.models,
    };
    if (plan.clearDefaultModel) sections['defaultModel'] = null;
    if (plan.clearDefaultProvider) sections['defaultProvider'] = null;
    await config.replaceSections(sections);
    return this.getConfig();
  }

  private async config(): Promise<IConfigService> {
    await this.configReady;
    return this.app.accessor.get(IConfigService);
  }

  // -- sessions -------------------------------------------------------------

  override async listSessions(): Promise<readonly SessionSummary[]> {
    const roots = new Map(
      (await this.app.accessor.get(IWorkspaceService).list()).map((workspace) => [
        workspace.id,
        workspace.root,
      ]),
    );
    const index = this.app.accessor.get(ISessionIndex);
    const sessions: SessionSummary[] = [];
    let before: string | undefined;
    do {
      const page = await index.listRecent(before === undefined ? {} : { before });
      for (const item of page.items) {
        const summary = this.mapIndexSummary(item, roots);
        if (summary !== undefined) sessions.push(summary);
      }
      before = page.nextCursor;
    } while (before !== undefined);
    return sessions;
  }

  override async createSession(input: CreateSessionOptions): Promise<SessionSummary> {
    const workDir = normalizeRequiredWorkDir('createSession', input.workDir);
    const handle = await this.app.accessor.get(ISessionManager).create({ workDir });
    this.wireSession(handle);
    return this.liveSessionSummary(handle);
  }

  override async resumeSession(input: ResumeSessionInput): Promise<SessionSummary> {
    return this.runSessionAccess(input.id, async () => {
      const handle = await resumeSessionById(this.app.accessor, input.id);
      if (handle === undefined) throw sessionNotFound(input.id);
      this.wireSession(handle);
      await this.materializeMainAgent(handle);
      return this.liveSessionSummary(handle);
    });
  }

  /**
   * The metadata service is session-scoped, so a session that is not live is
   * resumed, renamed, and closed again.
   */
  override async renameSession(input: RenameSessionInput): Promise<void> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new KimiError(ErrorCodes.SESSION_TITLE_EMPTY, 'Session title cannot be empty');
    }
    await this.runSessionAccess(input.id, () =>
      this.withTemporarySession(input.id, (handle) =>
        handle.accessor.get(ISessionMetadata).setTitle(title),
      ),
    );
  }

  override async closeSession(input: SessionIdRpcInput): Promise<void> {
    await this.runSessionAccess(input.sessionId, () =>
      this.app.accessor.get(ISessionManager).close(input.sessionId),
    );
  }

  /** Closes a live session first, then removes its directory and index entry. */
  override async deleteSession(input: SessionIdRpcInput): Promise<void> {
    await this.runSessionAccess(input.sessionId, async () => {
      try {
        await this.app.accessor.get(ISessionManager).delete(input.sessionId);
      } catch (error) {
        if (
          error instanceof Error &&
          (error as { code?: unknown }).code === ErrorCodes.SESSION_NOT_FOUND
        ) {
          throw sessionNotFound(input.sessionId);
        }
        throw error;
      }
    });
  }

  // -- the main agent -------------------------------------------------------

  override async prompt(input: SessionPromptRpcInput): Promise<void> {
    const agent = await this.agentScope(input.sessionId);
    await agent.accessor.get(IAgentPromptChannel).submit({ input: clone(input.input) });
  }

  override async cancel(input: SessionIdRpcInput): Promise<void> {
    const agent = await this.agentScope(input.sessionId);
    agent.accessor.get(IAgentLoopService).cancel();
  }

  override async setModel(input: SetSessionModelRpcInput): Promise<SetSessionModelRpcResult> {
    const agent = await this.agentScope(input.sessionId);
    const result = await agent.accessor.get(IAgentProfileService).setModel(input.model);
    return { model: result.model, providerName: result.providerName };
  }

  override async getContext(input: SessionIdRpcInput): Promise<AgentContextData> {
    const agent = await this.agentScope(input.sessionId);
    return {
      history: clone(agent.accessor.get(IAgentContextMemoryService).get()),
      tokenCount: agent.accessor
        .get(ISessionTokenCountingService)
        .statusSize(agentContextOf(agent)),
    };
  }

  // -- MCP ------------------------------------------------------------------

  override async listMcpServers(
    options: McpServerOptions = {},
  ): Promise<readonly McpManagedServerInfo[]> {
    const servers = await this.mcp().listServers({ cwd: options.cwd });
    return servers.map(toManagedServerInfo);
  }

  override async addMcpServer(
    server: McpServerConfig,
    options: McpServerOptions = {},
  ): Promise<readonly McpManagedServerInfo[]> {
    const servers = await this.mcp().addServer(server, { cwd: options.cwd });
    return servers.map(toManagedServerInfo);
  }

  override async removeMcpServer(
    name: string,
    options: McpServerOptions = {},
  ): Promise<readonly McpManagedServerInfo[]> {
    const servers = await this.mcp().removeServer(name, { cwd: options.cwd });
    return servers.map(toManagedServerInfo);
  }

  /** Probes an unsaved server config; nothing has to be persisted first. */
  override async testMcpServerConfig(
    server: McpServerConfig,
    options: McpServerOptions = {},
  ): Promise<McpTestResult> {
    return this.mcp().testServer({ server, cwd: options.cwd });
  }

  private mcp(): IMcpManagementService {
    return this.app.accessor.get(IMcpManagementService);
  }

  // -- helpers --------------------------------------------------------------

  private liveSession(sessionId: string): ISessionScopeHandle | undefined {
    return getLiveSessionById(this.app.accessor, sessionId);
  }

  private requireLiveSession(sessionId: string): ISessionScopeHandle {
    const handle = this.liveSession(sessionId);
    if (handle === undefined) throw sessionNotFound(sessionId);
    return handle;
  }

  /**
   * Runs `work` after every previously queued operation on the same session
   * settles; different sessions still run in parallel.
   */
  private runSessionAccess<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.sessionAccessQueues.get(sessionId) ?? Promise.resolve();
    const run = previous.then(work, work);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.sessionAccessQueues.set(sessionId, tail);
    void tail.then(() => {
      if (this.sessionAccessQueues.get(sessionId) === tail) {
        this.sessionAccessQueues.delete(sessionId);
      }
    });
    return run;
  }

  /**
   * Runs `action` without changing the session's live footprint: a live
   * session is used in place and left open, a cold one is resumed for the
   * duration of the action and closed again. Only safe inside
   * {@link runSessionAccess}.
   */
  private async withTemporarySession<T>(
    sessionId: string,
    action: (handle: ISessionScopeHandle) => Promise<T>,
  ): Promise<T> {
    const live = this.liveSession(sessionId);
    if (live !== undefined) return action(live);
    const handle = await resumeSessionById(this.app.accessor, sessionId);
    if (handle === undefined) throw sessionNotFound(sessionId);
    try {
      return await action(handle);
    } finally {
      await closeSessionById(this.app.accessor, sessionId);
    }
  }

  /**
   * The session's main agent, materialized on first use. An agent whose
   * profile is still unbound gets the default profile and the configured
   * default model; a home without a configured model leaves it unbound
   * instead of failing.
   */
  private async materializeMainAgent(session: ISessionScopeHandle): Promise<IAgentScopeHandle> {
    await this.modelReady;
    const context = await ensureMainAgent(session);
    const agent = session.accessor.get(IAgentLifecycleService).handleOf(context.agentId);
    if (agent === undefined) {
      throw new KimiError(ErrorCodes.AGENT_NOT_FOUND, 'Main agent was not found');
    }
    const profile = agent.accessor.get(IAgentProfileService);
    if (profile.data().profileName !== undefined) return agent;
    try {
      await profile.bind({ profile: DEFAULT_AGENT_PROFILE_NAME });
    } catch (error) {
      if (
        !(error instanceof ProfileError) ||
        error.code !== ProfileErrors.codes.MODEL_NOT_CONFIGURED
      ) {
        throw error;
      }
    }
    return agent;
  }

  private agentScope(sessionId: string): Promise<IAgentScopeHandle> {
    return this.materializeMainAgent(this.requireLiveSession(sessionId));
  }

  private wireSession(handle: ISessionScopeHandle): void {
    if (this.sessionWirings.has(handle.id)) return;
    this.sessionWirings.set(handle.id, new SessionEventWiring(handle, this));
  }

  private unwireSession(sessionId: string): void {
    const wiring = this.sessionWirings.get(sessionId);
    if (wiring === undefined) return;
    this.sessionWirings.delete(sessionId);
    wiring.dispose();
  }

  /** The summary of a live session, read from its own scope services. */
  private async liveSessionSummary(handle: ISessionScopeHandle): Promise<SessionSummary> {
    const meta = await handle.accessor.get(ISessionMetadata).read();
    const ctx = handle.accessor.get(ISessionContext);
    return {
      id: meta.id,
      title: meta.title,
      titleKind: meta.titleKind,
      lastPrompt: meta.lastPrompt,
      workDir: ctx.cwd,
      sessionDir: ctx.sessionDir,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      archived: meta.archived,
      metadata: meta.custom as JsonObject | undefined,
      additionalDirs: handle.accessor.get(ISessionWorkspaceContext).additionalDirs,
      // The live aggregate is authoritative: the metadata document can lag
      // both the restored outcome and a retry's clear.
      lastTurnReason: handle.accessor.get(ISessionActivityView).state().lastTurnReason,
    };
  }

  /**
   * Maps one index entry, resolving the filesystem facts the index does not
   * carry. Entries whose workDir is unrecoverable cannot be resumed and are
   * left out.
   */
  private mapIndexSummary(
    item: EngineSessionSummary,
    roots: ReadonlyMap<string, string>,
  ): SessionSummary | undefined {
    const workDir = item.cwd ?? roots.get(item.workspaceId);
    if (workDir === undefined) return undefined;
    // A live session reports its own outcome; the index may still carry a
    // stale one while the mirror's update is queued.
    const live = this.liveSession(item.id);
    const effective =
      live === undefined
        ? item
        : { ...item, lastTurnReason: live.accessor.get(ISessionActivityView).state().lastTurnReason };
    const bootstrapService = this.app.accessor.get(IBootstrapService);
    return v2SummaryToSessionSummary(effective, {
      workDir,
      sessionDir: sessionDirOf(
        bootstrapService.homeDir,
        workspacePersistenceScope(bootstrapService.scope('sessions'), item.workspaceId),
        item.id,
      ),
    });
  }
}

export function createKimiHarness(options: KimiHarnessOptions): KimiHarness {
  const rpc = new SDKRpcClientV2(options);
  return new KimiHarness(rpc, {
    homeDir: rpc.homeDir,
    configPath: rpc.configPath,
    onClose: () => rpc.close(),
  });
}

function sessionNotFound(sessionId: string): KimiError {
  return new KimiError(ErrorCodes.SESSION_NOT_FOUND, `Session "${sessionId}" was not found`, {
    details: { sessionId },
  });
}

function normalizeRequiredWorkDir(operation: string, workDir: string): string {
  if (typeof workDir !== 'string' || workDir.trim() === '') {
    throw new KimiError(ErrorCodes.REQUEST_WORK_DIR_REQUIRED, `${operation} requires workDir`);
  }
  return normalizeWorkDir(workDir);
}

/** JSON round-trip: callers never share mutable state with the engine. */
function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Flattens the managed view's config to the top level (mutable entries carry
 * the full values, read-only entries the redacted `envKeys` / `headerKeys`
 * lists) and tags it with the source metadata.
 */
function toManagedServerInfo(server: McpManagedServer): McpManagedServerInfo {
  return {
    name: server.name,
    ...server.config,
    source: server.source,
    origin: server.origin,
    mutable: server.mutable,
    plugin: server.plugin,
  } as McpManagedServerInfo;
}
