import type { ModelCapability } from '../contract/capability';

export interface ModelOverrides {
  readonly temperature?: number;
  readonly topP?: number;
  readonly thinkingKeep?: string;
  readonly maxCompletionTokens?: number;
}

export interface CompletionBudgetParams {
  readonly maxCompletionTokens: number;
  readonly usedContextTokens?: number;
  readonly maxContextTokens?: number;
}

export interface ResolvedModelAuthMaterial {
  readonly apiKey?: string;
  readonly apiKeyEnv?: string;
}

export interface ThinkingDefaults {
  readonly enabled?: boolean;
  readonly effort?: string;
}

export interface ModelThinkingMetadata {
  readonly capabilities?: ModelCapability | readonly string[];
  readonly adaptiveThinking?: boolean;
  readonly alwaysThinking?: boolean;
  readonly supportEfforts?: readonly string[];
  readonly defaultEffort?: string;
}
