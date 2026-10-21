import type {
  AddMcpServerInput,
  AddModelInput,
  ApprovalRequest,
  DoctorReport,
  McpServerSummary,
  McpTestOutcome,
  ModelOption,
  ProviderConfig,
  QuestionAnswers,
  QuestionRequest,
  SessionSummary,
  SettingsSnapshot,
  StreamDelta,
  TranscriptEntry,
  Workspace,
} from './contract';

export const IPC = {
  doctorRun: 'wow:doctor:run',
  workspacePick: 'wow:workspace:pick',
  workspaceList: 'wow:workspace:list',
  sessionList: 'wow:session:list',
  sessionCreate: 'wow:session:create',
  sessionDelete: 'wow:session:delete',
  sessionRename: 'wow:session:rename',
  sessionTranscript: 'wow:session:transcript',
  sessionSetModel: 'wow:session:set-model',
  promptSend: 'wow:prompt:send',
  promptCancel: 'wow:prompt:cancel',
  approvalRespond: 'wow:approval:respond',
  questionRespond: 'wow:question:respond',
  settingsSnapshot: 'wow:settings:snapshot',
  modelsList: 'wow:models:list',
  providerUpsert: 'wow:provider:upsert',
  providerRemove: 'wow:provider:remove',
  providerTest: 'wow:provider:test',
  modelAdd: 'wow:model:add',
  modelRemove: 'wow:model:remove',
  defaultModelSet: 'wow:model:set-default',
  mcpList: 'wow:mcp:list',
  mcpAdd: 'wow:mcp:add',
  mcpRemove: 'wow:mcp:remove',
  mcpTest: 'wow:mcp:test',
} as const;

export const EVENTS = {
  streamDelta: 'wow:event:stream-delta',
  approvalRequested: 'wow:event:approval-requested',
  questionAsked: 'wow:event:question-asked',
  sessionChanged: 'wow:event:session-changed',
} as const;

export interface WowBridge {
  doctor: { run(): Promise<DoctorReport> };
  workspace: {
    pick(): Promise<Workspace | null>;
    list(): Promise<Workspace[]>;
  };
  session: {
    list(): Promise<SessionSummary[]>;
    create(workDir: string): Promise<SessionSummary>;
    delete(sessionId: string): Promise<void>;
    rename(sessionId: string, title: string): Promise<void>;
    transcript(sessionId: string): Promise<TranscriptEntry[]>;
    setModel(sessionId: string, modelAlias: string): Promise<void>;
  };
  prompt: {
    send(sessionId: string, text: string): Promise<void>;
    cancel(sessionId: string): Promise<void>;
  };
  approval: { respond(approvalId: string, optionId: string): Promise<void> };
  question: { respond(questionId: string, answers: QuestionAnswers): Promise<void> };
  settings: { snapshot(): Promise<SettingsSnapshot> };
  models: {
    list(): Promise<ModelOption[]>;
    add(input: AddModelInput): Promise<void>;
    remove(alias: string): Promise<void>;
    setDefault(alias: string): Promise<void>;
  };
  provider: {
    upsert(config: ProviderConfig): Promise<void>;
    remove(name: string): Promise<void>;
    test(config: ProviderConfig): Promise<{ ok: boolean; detail: string }>;
  };
  mcp: {
    list(workDir?: string): Promise<McpServerSummary[]>;
    add(input: AddMcpServerInput, workDir?: string): Promise<McpServerSummary[]>;
    remove(name: string, workDir?: string): Promise<McpServerSummary[]>;
    test(input: AddMcpServerInput, workDir?: string): Promise<McpTestOutcome>;
  };
  on: {
    streamDelta(listener: (delta: StreamDelta) => void): () => void;
    approvalRequested(listener: (request: ApprovalRequest) => void): () => void;
    questionAsked(listener: (request: QuestionRequest) => void): () => void;
    sessionChanged(listener: () => void): () => void;
  };
}
