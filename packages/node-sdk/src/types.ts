import type { ContentPart } from '@wow/agent-core-v2';
import type { HostIdentity } from '@wow/oauth';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type Unsubscribe = () => void;

export type {
  McpManagedServerInfo,
  McpServerConfig,
  McpServerSource,
  McpTestResult,
} from '#/mcp';
export type {
  WowConfig,
  WowConfigPatch,
  ModelAlias,
  ProviderConfig,
  ProviderType,
} from '#/config/schema';
export type { AgentContextData, ContextMessage, PromptOrigin } from '#/context';

export type { HostIdentity };

export type TextPromptPart = Extract<ContentPart, { type: 'text' }>;
export type PromptPart = Extract<ContentPart, { type: 'text' | 'image_url' | 'video_url' }>;

export type PromptInput = readonly PromptPart[];

export interface WowHarnessOptions {
  readonly identity: HostIdentity;
  readonly homeDir?: string | undefined;
}

export interface CreateSessionOptions {
  readonly workDir: string;
}

export interface RenameSessionInput {
  readonly id: string;
  readonly title: string;
}

export interface ResumeSessionInput {
  readonly id: string;
}

export interface GetConfigOptions {
  readonly reload?: boolean | undefined;
}

export interface McpServerOptions {
  readonly cwd?: string;
}

export type SessionTitleKind = 'replaceable' | 'generated' | 'custom';

export interface SessionSummary {
  readonly id: string;
  readonly title?: string | undefined;
  readonly titleKind?: SessionTitleKind;
  readonly lastPrompt?: string;
  readonly workDir: string;
  readonly sessionDir: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly additionalDirs?: readonly string[];
  readonly lastTurnReason?: 'completed' | 'cancelled' | 'failed';
}
