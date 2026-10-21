import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DoctorReport,
  ModelOption,
  QuestionAnswers,
  QuestionRequest,
  SessionSummary,
  StreamDelta,
  TranscriptEntry,
  Workspace,
} from '@shared/contract';
import { describeError, type ErrorText } from '@shared/rpc';
import { bridge } from './bridge';
import { Composer } from './components/Composer';
import { MessageList } from './components/MessageList';
import { Onboarding } from './components/Onboarding';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ApprovalCard } from './components/ApprovalCard';
import { QuestionCard } from './components/QuestionCard';
import {
  applyDelta,
  EMPTY_APPROVAL_QUEUE,
  enqueueApproval,
  isStalled,
  resolveApproval,
  type ApprovalQueue,
} from './transcript';

const STALL_CHECK_INTERVAL_MS = 5_000;

export function App(): React.JSX.Element {
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalQueue>(EMPTY_APPROVAL_QUEUE);
  const [pendingQuestion, setPendingQuestion] = useState<QuestionRequest | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [error, setError] = useState<ErrorText | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());

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
      if (!report.ok) {
        setReady(true);
        return;
      }
      setWorkspaces(await bridge().workspace.list());
      const snapshot = await refreshModels();
      const rows = await refreshSessions();
      const first = rows[0];
      if (first !== undefined) await selectSession(first.id);
      // Land on the settings gate only when there is nothing to chat with;
      // otherwise stay on the chat view.
      setShowSettings(snapshot.models.length === 0);
      setReady(true);
    })();
  }, [refreshSessions, refreshModels, selectSession]);

  useEffect(() => {
    const offDelta = bridge().on.streamDelta((delta: StreamDelta) => {
      setEntries((current) => applyDelta(current, delta));
      if (delta.role === 'assistant' && delta.kind === 'text') setStreaming(!delta.done);
      lastActivity.current = Date.now();
    });
    const offApproval = bridge().on.approvalRequested((request) => {
      lastActivity.current = Date.now();
      setApprovals((queue) => enqueueApproval(queue, request));
    });
    const offQuestion = bridge().on.questionAsked((request: QuestionRequest) => {
      // Without a card here the engine's turn waits forever for an answer.
      setPendingQuestion(request);
    });
    const offChanged = bridge().on.sessionChanged(() => {
      setStreaming(false);
      void refreshSessions();
      // The turn settled: reload the canonical history so the transcript matches
      // what the engine persisted (tool calls, injected context, exact text).
      if (activeSession !== null) void selectSession(activeSession);
    });
    return () => {
      offDelta();
      offApproval();
      offQuestion();
      offChanged();
    };
  }, [refreshSessions, activeSession, selectSession]);

  // The engine has no wall-clock turn timeout, so a stream that dies mid-reply
  // leaves the UI spinning forever. Surface it instead of pretending to work.
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => {
      if (isStalled(lastActivity.current, Date.now())) setStalled(true);
    }, STALL_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [streaming]);

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

  const newSession = useCallback(
    async (workDir: string) => {
      const session = await bridge().session.create(workDir);
      await refreshSessions();
      await selectSession(session.id);
    },
    [refreshSessions, selectSession],
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        await bridge().session.rename(sessionId, title);
        await refreshSessions();
      } catch (cause) {
        setError(describeError(cause));
      }
    },
    [refreshSessions],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await bridge().session.delete(sessionId);
      const rows = await refreshSessions();
      if (activeSession !== sessionId) return;
      const next = rows[0];
      if (next !== undefined) {
        await selectSession(next.id);
        return;
      }
      setActiveSession(null);
      setEntries([]);
    },
    [activeSession, refreshSessions, selectSession],
  );

  const send = useCallback(
    async (text: string) => {
      if (activeSession === null) return;
      setError(null);
      setStalled(false);
      setStreaming(true);
      lastActivity.current = Date.now();
      try {
        await bridge().prompt.send(activeSession, text);
      } catch (cause) {
        setStreaming(false);
        setError(describeError(cause));
      }
    },
    [activeSession],
  );

  const respond = useCallback(
    async (optionId: string) => {
      const current = approvals.current;
      if (current === null) return;
      setApprovals((queue) => resolveApproval(queue, current.id));
      try {
        await bridge().approval.respond(current.id, optionId);
      } catch (cause) {
        setError(describeError(cause));
      }
    },
    [approvals],
  );

  const respondQuestion = useCallback(
    async (answers: QuestionAnswers) => {
      const current = pendingQuestion;
      if (current === null) return;
      setPendingQuestion(null);
      try {
        await bridge().question.respond(current.id, answers);
      } catch (cause) {
        setError(describeError(cause));
      }
    },
    [pendingQuestion],
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === sessionWorkspace(sessions, activeSession)),
    [workspaces, sessions, activeSession],
  );

  if (doctor !== null && !doctor.ok) {
    return <Onboarding report={doctor} onRetry={() => void bridge().doctor.run().then(setDoctor)} />;
  }

  // Hold the shell until boot data has landed: mounting Settings early makes it
  // snapshot an empty config and render "no providers" for a moment.
  if (!ready) {
    return <div className="h-full bg-canvas" />;
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
          onNewSession={(workDir) => void newSession(workDir)}
          onDeleteSession={(id) => void deleteSession(id)}
          onRenameSession={(id, title) => void renameSession(id, title)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {showSettings ? (
            <Settings
              workDir={activeWorkspace?.path}
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
              {approvals.current !== null && (
                <ApprovalCard
                  request={approvals.current}
                  queued={approvals.pending.length}
                  onRespond={(id) => void respond(id)}
                />
              )}
              {pendingQuestion !== null && (
                <QuestionCard
                  request={pendingQuestion}
                  onRespond={(answers) => void respondQuestion(answers)}
                />
              )}
              {error !== null && (
                <div className="mx-auto w-full max-w-3xl px-6 pb-2">
                  <p className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {error.text}
                  </p>
                </div>
              )}
              {stalled && streaming && (
                <div className="mx-auto w-full max-w-3xl px-6 pb-2">
                  <div className="flex items-center justify-between gap-3 rounded-control border border-hairline bg-surface px-3 py-2">
                    <p className="text-[12px] text-ink-muted">
                      已经很久没有收到新的输出，模型可能卡住了。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStalled(false);
                        lastActivity.current = Date.now();
                        void bridge().prompt.cancel(activeSession);
                      }}
                      className="shrink-0 rounded-control border border-hairline px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
                    >
                      停止这一轮
                    </button>
                  </div>
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