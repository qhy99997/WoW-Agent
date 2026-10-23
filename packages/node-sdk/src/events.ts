import type {
  ApprovalRequest,
  ApprovalResponse,
  QuestionRequest,
  QuestionResult,
} from '#/interaction';

export type { Event, ToolResultEvent } from '@wow/agent-core-v2/events';

export type { ApprovalRequest, ApprovalScope } from '#/interaction';
export type { ApprovalDecision, ApprovalResponse } from '#/interaction';

export type { ToolInputDisplay } from '@wow/agent-core-v2/tool/toolInputDisplay';

export type {
  QuestionRequest,
  QuestionItem,
  QuestionOption,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionResponse,
  QuestionResult,
} from '#/interaction';

export type MaybePromise<T> = T | Promise<T>;

export type ApprovalHandler = (request: ApprovalRequest) => MaybePromise<ApprovalResponse>;

export type QuestionHandler = (request: QuestionRequest) => MaybePromise<QuestionResult>;
