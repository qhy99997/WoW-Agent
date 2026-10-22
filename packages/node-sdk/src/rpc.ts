import type { AgentContextData } from '#/context';
import { ErrorCodes, type KimiErrorCode } from '#/errors';
import type { ApprovalHandler, Event, QuestionHandler } from '#/events';
import type {
  ApprovalRequest,
  ApprovalResponse,
  QuestionRequest,
  QuestionResult,
  ToolCallRequest,
  ToolCallResponse,
} from '#/interaction';
import type {
  CreateSessionOptions,
  GetConfigOptions,
  KimiConfig,
  KimiConfigPatch,
  McpManagedServerInfo,
  McpServerConfig,
  McpServerOptions,
  McpTestResult,
  PromptInput,
  RenameSessionInput,
  ResumeSessionInput,
  SessionSummary,
  Unsubscribe,
} from '#/types';

export interface SessionPromptRpcInput {
  readonly sessionId: string;
  readonly input: PromptInput;
}

export interface SessionIdRpcInput {
  readonly sessionId: string;
}

export interface SetSessionModelRpcInput extends SessionIdRpcInput {
  readonly model: string;
}

export interface SetSessionModelRpcResult {
  readonly model: string;
  readonly providerName?: string | undefined;
}

/**
 * The engine-facing half of the SDK: the abstract operations a `KimiHarness` /
 * `Session` pair needs, plus the per-session event listeners and the
 * approval / question handler registries the engine wiring feeds.
 */
export abstract class SDKRpcClientBase {
  private readonly eventListeners = new Set<(event: Event) => void>();
  private readonly approvalHandlers = new Map<string, ApprovalHandler>();
  private readonly questionHandlers = new Map<string, QuestionHandler>();

  abstract createSession(input: CreateSessionOptions): Promise<SessionSummary>;

  abstract resumeSession(input: ResumeSessionInput): Promise<SessionSummary>;

  abstract closeSession(input: SessionIdRpcInput): Promise<void>;

  abstract deleteSession(input: SessionIdRpcInput): Promise<void>;

  abstract listSessions(): Promise<readonly SessionSummary[]>;

  abstract renameSession(input: RenameSessionInput): Promise<void>;

  abstract getConfig(input?: GetConfigOptions): Promise<KimiConfig>;

  abstract setConfig(input: KimiConfigPatch): Promise<KimiConfig>;

  abstract replaceConfigSection(domain: string, value: unknown): Promise<KimiConfig>;

  abstract removeProvider(providerId: string): Promise<KimiConfig>;

  abstract listMcpServers(options?: McpServerOptions): Promise<readonly McpManagedServerInfo[]>;

  abstract addMcpServer(
    server: McpServerConfig,
    options?: McpServerOptions,
  ): Promise<readonly McpManagedServerInfo[]>;

  abstract removeMcpServer(
    name: string,
    options?: McpServerOptions,
  ): Promise<readonly McpManagedServerInfo[]>;

  abstract testMcpServerConfig(
    server: McpServerConfig,
    options?: McpServerOptions,
  ): Promise<McpTestResult>;

  abstract prompt(input: SessionPromptRpcInput): Promise<void>;

  abstract cancel(input: SessionIdRpcInput): Promise<void>;

  abstract setModel(input: SetSessionModelRpcInput): Promise<SetSessionModelRpcResult>;

  abstract getContext(input: SessionIdRpcInput): Promise<AgentContextData>;

  onEvent(listener: (event: Event) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  receiveEvent(event: Event): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  setApprovalHandler(sessionId: string, handler: ApprovalHandler | undefined): void {
    if (handler === undefined) {
      this.approvalHandlers.delete(sessionId);
      return;
    }
    this.approvalHandlers.set(sessionId, handler);
  }

  setQuestionHandler(sessionId: string, handler: QuestionHandler | undefined): void {
    if (handler === undefined) {
      this.questionHandlers.delete(sessionId);
      return;
    }
    this.questionHandlers.set(sessionId, handler);
  }

  clearSessionHandlers(sessionId: string): void {
    this.approvalHandlers.delete(sessionId);
    this.questionHandlers.delete(sessionId);
  }

  async requestApproval(
    request: ApprovalRequest & { sessionId: string; agentId: string },
  ): Promise<ApprovalResponse> {
    const handler = this.approvalHandlers.get(request.sessionId);
    if (handler === undefined) {
      return {
        decision: 'cancelled',
        feedback: 'No approval handler registered.',
      };
    }

    try {
      return await handler(request);
    } catch (error) {
      this.emitHandlerError(request, ErrorCodes.SESSION_APPROVAL_HANDLER_ERROR, error);
      return {
        decision: 'cancelled',
        feedback: 'Approval handler failed.',
      };
    }
  }

  async requestQuestion(
    request: QuestionRequest & { sessionId: string; agentId: string },
  ): Promise<QuestionResult> {
    const handler = this.questionHandlers.get(request.sessionId);
    if (handler === undefined) return null;

    try {
      return await handler(request);
    } catch (error) {
      this.emitHandlerError(request, ErrorCodes.SESSION_QUESTION_HANDLER_ERROR, error);
      return null;
    }
  }

  async toolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    return {
      output: `SDK custom tool calls are not supported: ${request.toolCallId}`,
      isError: true,
    };
  }

  private emitHandlerError(
    request: { readonly sessionId: string; readonly agentId: string },
    code: KimiErrorCode,
    error: unknown,
  ): void {
    this.receiveEvent({
      type: 'error',
      sessionId: request.sessionId,
      agentId: request.agentId,
      code,
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    });
  }
}
