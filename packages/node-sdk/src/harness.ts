import { ErrorCodes, WowError } from '#/errors';
import type { SDKRpcClientBase } from '#/rpc';
import { Session } from '#/session';
import type {
  CreateSessionOptions,
  GetConfigOptions,
  WowConfig,
  WowConfigPatch,
  McpManagedServerInfo,
  McpServerConfig,
  McpServerOptions,
  McpTestResult,
  RenameSessionInput,
  ResumeSessionInput,
  SessionSummary,
} from '#/types';

export interface WowHarnessRuntimeOptions {
  readonly homeDir: string;
  readonly configPath: string;
  readonly onClose: () => void | Promise<void>;
}

export class WowHarness {
  readonly homeDir: string;
  readonly configPath: string;

  private readonly activeSessions = new Map<string, Session>();
  private readonly resumeInflight = new Map<string, Promise<Session>>();
  private readonly closeImpl: () => void | Promise<void>;

  constructor(
    private readonly rpc: SDKRpcClientBase,
    options: WowHarnessRuntimeOptions,
  ) {
    this.homeDir = options.homeDir;
    this.configPath = options.configPath;
    this.closeImpl = options.onClose;
  }

  async createSession(options: CreateSessionOptions): Promise<Session> {
    const summary = await this.rpc.createSession({ workDir: options.workDir });
    return this.track(summary);
  }

  async resumeSession(input: ResumeSessionInput): Promise<Session> {
    const id = normalizeSessionId(input.id);
    const active = this.activeSessions.get(id);
    // A session whose close is in flight (`isClosed` but not yet unmapped)
    // is not a valid resume target — fall through and re-resume fresh, which
    // the engine serializes behind that close.
    if (active !== undefined && !active.isClosed) return active;

    // Coalesce concurrent resumes of the same id onto one facade; without
    // this, parallel callers each build their own Session over the shared
    // engine handle, and one facade's close kills the engine handle under
    // the other.
    const inflight = this.resumeInflight.get(id);
    if (inflight !== undefined) return inflight;
    const run = this.rpc.resumeSession({ id }).then((summary) => this.track(summary));
    this.resumeInflight.set(id, run);
    try {
      return await run;
    } finally {
      if (this.resumeInflight.get(id) === run) this.resumeInflight.delete(id);
    }
  }

  async deleteSession(id: string): Promise<void> {
    const sessionId = normalizeSessionId(id);
    await this.activeSessions.get(sessionId)?.close();
    await this.rpc.deleteSession({ sessionId });
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    await this.rpc.renameSession(input);
    this.activeSessions
      .get(input.id)
      ?.emitMetaUpdated({ title: input.title, isCustomTitle: true });
  }

  async listSessions(): Promise<readonly SessionSummary[]> {
    return this.rpc.listSessions();
  }

  async getConfig(options: GetConfigOptions = {}): Promise<WowConfig> {
    return this.rpc.getConfig(options);
  }

  async setConfig(patch: WowConfigPatch): Promise<WowConfig> {
    return this.rpc.setConfig(patch);
  }

  /**
   * Replace one config domain wholesale. `setConfig` deep-merges, so it cannot
   * express "drop this key"; this is the escape hatch for deletions (removing a
   * model alias, clearing a section). `undefined` deletes the domain.
   */
  async replaceConfigSection(domain: string, value: unknown): Promise<WowConfig> {
    return this.rpc.replaceConfigSection(domain, value);
  }

  async removeProvider(providerId: string): Promise<WowConfig> {
    return this.rpc.removeProvider(providerId);
  }

  /**
   * The unified MCP management view: user-level `<WOW_HOME>/mcp.json`
   * entries (mutable), plus read-only project-layer entries when `cwd` is
   * given and plugin-contributed entries — each tagged with its `source`,
   * `origin`, and `mutable` flag.
   */
  async listMcpServers(options: McpServerOptions = {}): Promise<readonly McpManagedServerInfo[]> {
    return this.rpc.listMcpServers(options);
  }

  async addMcpServer(
    server: McpServerConfig,
    options: McpServerOptions = {},
  ): Promise<readonly McpManagedServerInfo[]> {
    return this.rpc.addMcpServer(server, options);
  }

  async removeMcpServer(
    name: string,
    options: McpServerOptions = {},
  ): Promise<readonly McpManagedServerInfo[]> {
    return this.rpc.removeMcpServer(name, options);
  }

  /** Probe a full inline MCP server config without saving it first. */
  async testMcpServerConfig(
    server: McpServerConfig,
    options: McpServerOptions = {},
  ): Promise<McpTestResult> {
    return this.rpc.testMcpServerConfig(server, options);
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.activeSessions.values(), (session) => session.close()));
    await this.closeImpl();
  }

  private track(summary: SessionSummary): Session {
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: this.rpc,
      onClose: () => {
        if (this.activeSessions.get(summary.id) === session) {
          this.activeSessions.delete(summary.id);
        }
      },
    });
    this.activeSessions.set(session.id, session);
    return session;
  }
}

function normalizeSessionId(value: string): string {
  if (typeof value !== 'string') {
    throw new WowError(ErrorCodes.SESSION_ID_REQUIRED, 'Session id is required.');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new WowError(ErrorCodes.SESSION_ID_EMPTY, 'Session id cannot be empty.');
  }
  return normalized;
}
