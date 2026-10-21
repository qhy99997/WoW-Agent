import { z } from 'zod';

export const PermissionModeSchema = z.enum(['ask', 'allow-all', 'deny-all']);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const SessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  workDir: z.string(),
  updatedAt: z.number(),
  status: z.string(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ModelOptionSchema = z.object({
  alias: z.string(),
  provider: z.string(),
  displayName: z.string(),
});
export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const DoctorReportSchema = z.object({
  ok: z.boolean(),
  checks: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(['ok', 'warn', 'fail']),
      detail: z.string(),
      hint: z.string().optional(),
    }),
  ),
});
export type DoctorReport = z.infer<typeof DoctorReportSchema>;

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  wireType: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const TranscriptEntrySchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  kind: z.string(),
  text: z.string(),
  createdAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  diff: z.string().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const QuestionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
});
export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

export const StreamDeltaSchema = z.object({
  sessionId: z.string(),
  entryId: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  kind: z.string(),
  text: z.string(),
  done: z.boolean(),
});
export type StreamDelta = z.infer<typeof StreamDeltaSchema>;

export const RpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string().optional(),
});
export type RpcError = z.infer<typeof RpcErrorSchema>;

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };
