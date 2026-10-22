import type { KimiErrorCode as EngineErrorCode } from '@moonshot-ai/agent-core-v2';

export const ErrorCodes = {
  CONFIG_INVALID: 'config.invalid',
  SESSION_NOT_FOUND: 'session.not_found',
  SESSION_ID_REQUIRED: 'session.id_required',
  SESSION_ID_EMPTY: 'session.id_empty',
  SESSION_TITLE_EMPTY: 'session.title_empty',
  SESSION_CLOSED: 'session.closed',
  SESSION_MODEL_EMPTY: 'session.model_empty',
  SESSION_APPROVAL_HANDLER_ERROR: 'session.approval_handler_error',
  SESSION_QUESTION_HANDLER_ERROR: 'session.question_handler_error',
  AGENT_NOT_FOUND: 'agent.not_found',
  REQUEST_WORK_DIR_REQUIRED: 'request.work_dir_required',
  REQUEST_PROMPT_INPUT_EMPTY: 'request.prompt_input_empty',
} as const satisfies Record<string, EngineErrorCode>;

export type KimiErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface KimiErrorOptions {
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

export class KimiError extends Error {
  readonly code: KimiErrorCode;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(code: KimiErrorCode, message: string, options: KimiErrorOptions = {}) {
    super(message);
    this.name = 'KimiError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isKimiError(error: unknown): error is KimiError {
  return error instanceof KimiError;
}
