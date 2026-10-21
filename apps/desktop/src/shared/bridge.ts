import type {
  ApprovalRequest,
  DoctorReport,
  ModelOption,
  ProviderConfig,
  QuestionRequest,
  SessionSummary,
  StreamDelta,
  TranscriptEntry,
  Workspace,
} from './contract.js';

export const IPC = {
  doctorRun: 'wow:doctor:run',
  workspacePick: 'wow:workspace:pick',
  workspaceList: 'wow:workspace:list',
  sessionList: 'wow:session:list',
  sessionCreate: 'wow:session:create',
  sessionDelete: 'wow:session:delete',
  sessionRename: 'wow:session:rename',
  sessionTranscript: 'wow:session:transcript',
  promptSend: 'wow:prompt:send',
  promptCancel: 'wow:prompt:cancel',
  approvalRespond: 'wow:approval:respond',
  questionRespond: 'wow:question:respond',
  modelsList: 'wow:models:list',
  providerUpsert: 'wow:provider:upsert',
  providerTest: 'wow:provider:test',
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
  };
  prompt: {
    send(sessionId: string, text: string): Promise<void>;
    cancel(sessionId: string): Promise<void>;
  };
  approval: { respond(approvalId: string, optionId: string): Promise<void> };
  question: { respond(questionId: string, answer: string): Promise<void> };
  models: { list(): Promise<ModelOption[]> };
  provider: {
    upsert(config: ProviderConfig): Promise<void>;
    test(config: ProviderConfig): Promise<{ ok: boolean; detail: string }>;
  };
  on: {
    streamDelta(listener: (delta: StreamDelta) => void): () => void;
    approvalRequested(listener: (request: ApprovalRequest) => void): () => void;
    questionAsked(listener: (request: QuestionRequest) => void): () => void;
    sessionChanged(listener: () => void): () => void;
  };
}
