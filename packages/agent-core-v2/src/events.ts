import type { CompactionBlockedEvent, CompactionCancelledEvent, CompactionCompletedEvent, CompactionStartedEvent } from '#/agent/fullCompaction/compactionOps';
import type { TurnStartedEvent, TurnStepCompletedEvent, TurnStepInterruptedEvent, TurnStepRetryingEvent, TurnStepStartedEvent, AssistantDeltaEvent, ThinkingDeltaEvent } from '#/agent/loop/turnEvents';
import type { TurnEndedEvent } from '#/agent/loop/turnOps';
import type { PromptAbortedEvent, PromptCompletedEvent, PromptSteeredEvent, PromptSubmittedEvent } from '#/agent/prompt/promptEvents';
import type { BackgroundTaskStartedEvent, BackgroundTaskTerminatedEvent, TaskStartedEvent, TaskTerminatedEvent } from '#/agent/task/types';
import type { McpServerStatusEvent, ToolCallDeltaEvent, ToolCallStartedEvent, ToolListUpdatedEvent, ToolProgressEvent } from '#/agent/toolExecutor/toolExecutorEvents';
import type { ToolResultEventPayload } from '#/agent/toolExecutor/toolExecutorEvents';
import type { AgentStatusUpdatedEvent } from '#/agent/usage/usageEvents';
import type { ConfigChangedEvent, ConfigWarningEvent } from '#/app/config/configEvents';
import type { PluginChangedEvent } from '#/app/plugin/pluginEvents';
import type { WorkspaceCreatedEvent, WorkspaceDeletedEvent, WorkspaceUpdatedEvent } from '#/app/workspace/workspaceProtocol';
import type { CronFiredEvent } from '#/features/cron/cronOps';
import type { HookResultEvent } from '#/features/externalHooks/agent/agentExternalHooksService';
import type { GoalUpdatedEvent } from '#/features/goal/goalOps';
import type { SkillActivatedEvent } from '#/features/skill/skillOps';
import type { SubagentSuspendedEvent } from '#/features/swarm/session/sessionSwarmService';
import type { SessionMetaUpdatedEvent } from '#/session/sessionMetadata/sessionMetaEvents';
import type { SubagentCancelledEvent, SubagentCompletedEvent, SubagentFailedEvent, SubagentSpawnedEvent, SubagentStartedEvent } from '#/session/subagent/mirrorAgentRun';

import type { ErrorEvent, WarningEvent } from './errors';

export interface ToolResultEvent extends Omit<ToolResultEventPayload, 'agentId'> {
  readonly type: 'tool.result';
}

export type AgentEvent =
  | ErrorEvent
  | WarningEvent
  | AgentStatusUpdatedEvent
  | SessionMetaUpdatedEvent
  | WorkspaceCreatedEvent
  | WorkspaceUpdatedEvent
  | WorkspaceDeletedEvent
  | ConfigChangedEvent
  | ConfigWarningEvent
  | PluginChangedEvent
  | GoalUpdatedEvent
  | SkillActivatedEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | TurnStepStartedEvent
  | TurnStepCompletedEvent
  | TurnStepRetryingEvent
  | TurnStepInterruptedEvent
  | AssistantDeltaEvent
  | HookResultEvent
  | ThinkingDeltaEvent
  | ToolCallDeltaEvent
  | ToolCallStartedEvent
  | ToolProgressEvent
  | ToolResultEvent
  | ToolListUpdatedEvent
  | McpServerStatusEvent
  | SubagentSpawnedEvent
  | SubagentStartedEvent
  | SubagentSuspendedEvent
  | SubagentCompletedEvent
  | SubagentFailedEvent
  | SubagentCancelledEvent
  | CompactionStartedEvent
  | CompactionBlockedEvent
  | CompactionCancelledEvent
  | CompactionCompletedEvent
  | TaskStartedEvent
  | TaskTerminatedEvent
  | BackgroundTaskStartedEvent
  | BackgroundTaskTerminatedEvent
  | CronFiredEvent
  | PromptSubmittedEvent
  | PromptCompletedEvent
  | PromptAbortedEvent
  | PromptSteeredEvent;

export type Event = AgentEvent & { agentId: string; sessionId: string };
