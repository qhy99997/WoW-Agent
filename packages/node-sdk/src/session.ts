import type { AgentContextData } from '#/context';
import { ErrorCodes, KimiError } from '#/errors';
import type { ApprovalHandler, Event, QuestionHandler } from '#/events';
import type { SDKRpcClientBase } from '#/rpc';
import type { PromptInput, SessionSummary, Unsubscribe } from '#/types';

const MAIN_AGENT_ID = 'main';

export interface SessionOptions {
  readonly id: string;
  readonly workDir: string;
  readonly summary?: SessionSummary | undefined;
  readonly rpc: SDKRpcClientBase;
  readonly onClose?: (() => void | Promise<void>) | undefined;
}

export class Session {
  readonly id: string;
  readonly workDir: string;
  summary?: SessionSummary | undefined;

  private readonly rpc: SDKRpcClientBase;
  private readonly onClose?: (() => void | Promise<void>) | undefined;
  private closed = false;

  constructor(options: SessionOptions) {
    this.id = options.id;
    this.workDir = options.workDir;
    this.summary = options.summary;
    this.rpc = options.rpc;
    this.onClose = options.onClose;
  }

  /** True once {@link close} began — the session may still be closing in the engine. */
  get isClosed(): boolean {
    return this.closed;
  }

  onEvent(listener: (event: Event) => void): Unsubscribe {
    this.ensureOpen();
    return this.rpc.onEvent((event) => {
      if (event.sessionId === this.id) {
        listener(event);
      }
    });
  }

  setApprovalHandler(handler: ApprovalHandler | undefined): void {
    this.ensureOpen();
    this.rpc.setApprovalHandler(this.id, handler);
  }

  setQuestionHandler(handler: QuestionHandler | undefined): void {
    this.ensureOpen();
    this.rpc.setQuestionHandler(this.id, handler);
  }

  async prompt(input: string | PromptInput): Promise<void> {
    this.ensureOpen();
    await this.rpc.prompt({ sessionId: this.id, input: normalizePromptInput(input) });
  }

  async cancel(): Promise<void> {
    this.ensureOpen();
    await this.rpc.cancel({ sessionId: this.id });
  }

  async setModel(model: string): Promise<void> {
    this.ensureOpen();
    const normalized = model.trim();
    if (normalized.length === 0) {
      throw new KimiError(ErrorCodes.SESSION_MODEL_EMPTY, 'Session model cannot be empty');
    }
    await this.rpc.setModel({ sessionId: this.id, model: normalized });
  }

  async getContext(): Promise<AgentContextData> {
    this.ensureOpen();
    return this.rpc.getContext({ sessionId: this.id });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.rpc.closeSession({ sessionId: this.id });
    } finally {
      this.rpc.clearSessionHandlers(this.id);
      await this.onClose?.();
    }
  }

  /** @internal */
  emitMetaUpdated(patch: { readonly title?: string; readonly isCustomTitle?: boolean }): void {
    this.rpc.receiveEvent({
      type: 'session.meta.updated',
      sessionId: this.id,
      agentId: MAIN_AGENT_ID,
      title: patch.title,
      patch,
    });
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new KimiError(ErrorCodes.SESSION_CLOSED, 'Session is closed');
    }
  }
}

function normalizePromptInput(input: string | PromptInput): PromptInput {
  if (typeof input === 'string') {
    if (input.trim().length === 0) {
      throw new KimiError(ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY, 'Prompt input cannot be empty');
    }
    return [{ type: 'text', text: input }];
  }

  if (input.length === 0) {
    throw new KimiError(ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY, 'Prompt input cannot be empty');
  }

  for (const part of input) {
    switch (part.type) {
      case 'text':
        if (part.text.trim().length === 0) {
          throw new KimiError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty text parts',
          );
        }
        break;
      case 'image_url':
        if (part.imageUrl.url.trim().length === 0) {
          throw new KimiError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty image URLs',
          );
        }
        break;
      case 'video_url':
        if (part.videoUrl.url.trim().length === 0) {
          throw new KimiError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty video URLs',
          );
        }
        break;
    }
  }
  return input;
}
