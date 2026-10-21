import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ApprovalRequest,
  DoctorReport,
  ModelOption,
  QuestionRequest,
  SessionSummary,
  StreamDelta,
  TranscriptEntry,
  Workspace,
} from '@shared/contract.js';
import { bridge } from './bridge';
import { Composer } from './components/Composer';
import { MessageList } from './components/MessageList';
import { Onboarding } from './components/Onboarding';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ApprovalCard } from './components/ApprovalCard';

export function App(): React.JSX.Element {
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    const rows = await bridge().session.list();
    setSessions(rows);
    return rows;
  }, []);

  const refreshModels = useCallback(async () => {
    const snapshot = await bridge().settings.snapshot();
    setModels(snapshot.models);
    const preferred = snapshot.defaultModel ?? snapshot.models[0]?.alias ?? null;
    setActiveModel((current) => current ?? preferred);
    return snapshot;
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    setActiveSession(sessionId);
    const transcript = await bridge().session.transcript(sessionId);
    setEntries(transcript);
  }, []);

  useEffect(() => {
    void (async () => {
      const report = await bridge().doctor.run();
      setDoctor(report);
      if (!report.ok) return;
      setWorkspaces(await bridge().workspace.list());
      const snapshot = await refreshModels();
      const rows = await refreshSessions();
      const first = rows[0];
      if (first !== undefined) await selectSession(first.id);
      if (snapshot.models.length === 0) setShowSettings(true);
    })();
  }, [refreshSessions, refreshModels, selectSession]);

  useEffect(() => {
    const offDelta = bridge().on.streamDelta((delta: StreamDelta) => {
      setEntries((current) => applyDelta(current, delta));
      if (delta.role === 'assistant' && delta.kind === 'text') setStreaming(!delta.done);
    });
    const offApproval = bridge().on.approvalRequested((request) => {
      setApproval(request);
    });
    const offQuestion = bridge().on.questionAsked((_request: QuestionRequest) => {
      /* questions surface inside the transcript once wired */
    });
    const offChanged = bridge().on.sessionChanged(() => {
      setStreaming(false);
      void refreshSessions();
    });
    return () => {
      offDelta();
      offApproval();
      offQuestion();
      offChanged();
    };
  }, [refreshSessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  const pickWorkspace = useCallback(async () => {
    const workspace = await bridge().workspace.pick();
    if (workspace === null) return;
    setWorkspaces(await bridge().workspace.list());
    const session = await bridge().session.create(workspace.path);
    await refreshSessions();
    await selectSession(session.id);
  }, [refreshSessions, selectSession]);

  const send = useCallback(
    async (text: string) => {
      if (activeSession === null) return;
      setError(null);
      setStreaming(true);
      try {
        await bridge().prompt.send(activeSession, text);
      } catch (cause) {
        setStreaming(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [activeSession],
  );

  const respond = useCallback(async (optionId: string) => {
    const current = approval;
    setApproval(null);
    if (current === null) return;
    await bridge().approval.respond(current.id, optionId);
  }, [approval]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === sessionWorkspace(sessions, activeSession)),
    [workspaces, sessions, activeSession],
  );

  if (doctor !== null && !doctor.ok) {
    return <Onboarding report={doctor} onRetry={() => void bridge().doctor.run().then(setDoctor)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="wow-drag flex h-10 shrink-0 items-center justify-between border-b border-hairline px-4">
        <span className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">WoW</span>
        <button
          type="button"
          onClick={() => {
            setShowSettings(true);
          }}
          className="wow-no-drag rounded-control px-2 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          设置
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          sessions={sessions}
          workspaces={workspaces}
          activeSession={activeSession}
          activeWorkspaceId={activeWorkspace?.id ?? null}
          onSelect={(id) => void selectSession(id)}
          onPickWorkspace={() => void pickWorkspace()}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {showSettings ? (
            <Settings
              onClose={() => {
                setShowSettings(false);
                void refreshModels();
              }}
            />
          ) : activeSession === null ? (
            <EmptyState
              hasModel={models.length > 0}
              onPickWorkspace={() => void pickWorkspace()}
              onOpenSettings={() => {
                setShowSettings(true);
              }}
            />
          ) : (
            <>
              <MessageList entries={entries} bottomRef={bottomRef} />
              {approval !== null && (
                <ApprovalCard request={approval} onRespond={(id) => void respond(id)} />
              )}
              {error !== null && (
                <div className="mx-auto w-full max-w-3xl px-6 pb-2">
                  <p className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {error}
                  </p>
                </div>
              )}
              <Composer
                disabled={streaming}
                models={models}
                activeModel={activeModel}
                onModelChange={(alias) => {
                  setActiveModel(alias);
                  void bridge().session.setModel(activeSession, alias).catch(() => undefined);
                }}
                onSubmit={(text) => void send(text)}
                onCancel={() => void bridge().prompt.cancel(activeSession)}
                workspaceName={activeWorkspace?.name ?? ''}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function sessionWorkspace(sessions: SessionSummary[], activeSession: string | null): string | null {
  const session = sessions.find((row) => row.id === activeSession);
  return session?.workDir ?? null;
}

function applyDelta(current: TranscriptEntry[], delta: StreamDelta): TranscriptEntry[] {
  const index = current.findIndex((entry) => entry.id === delta.entryId);
  if (index === -1) {
    return [
      ...current,
      {
        id: delta.entryId,
        role: delta.role,
        kind: delta.kind,
        text: delta.text,
        createdAt: Date.now(),
      },
    ];
  }
  const next = [...current];
  const existing = next[index];
  if (existing === undefined) return current;
  next[index] = { ...existing, text: existing.text + delta.text };
  return next;
}

function EmptyState({
  hasModel,
  onPickWorkspace,
  onOpenSettings,
}: {
  hasModel: boolean;
  onPickWorkspace: () => void;
  onOpenSettings: () => void;
}): React.JSX.Element {
  if (!hasModel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-[22px] font-medium tracking-tight">先配置一个模型</h1>
        <p className="max-w-md text-[13px] text-ink-muted">
          WoW 不要求登录账号。填一个兼容 OpenAI / Anthropic 的 Base URL 和 API Key
          就可以开始。
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="wow-no-drag rounded-control bg-accent px-4 py-2 text-[13px] font-medium text-canvas transition-colors hover:brightness-110"
        >
          打开设置
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[22px] font-medium tracking-tight">开始一个会话</h1>
      <p className="max-w-md text-[13px] text-ink-muted">
        选择一个项目目录，WoW 会在其中读写文件、运行命令，并在动手前征求你的同意。
      </p>
      <button
        type="button"
        onClick={onPickWorkspace}
        className="wow-no-drag rounded-control bg-accent px-4 py-2 text-[13px] font-medium text-canvas transition-colors hover:brightness-110"
      >
        选择项目目录
      </button>
    </div>
  );
}