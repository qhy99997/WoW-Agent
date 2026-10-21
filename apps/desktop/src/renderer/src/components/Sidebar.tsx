import { useState } from 'react';

import type { SessionSummary, Workspace } from '@shared/contract';

interface SidebarProps {
  sessions: SessionSummary[];
  workspaces: Workspace[];
  activeSession: string | null;
  activeWorkspaceId: string | null;
  onSelect: (sessionId: string) => void;
  onPickWorkspace: () => void;
  onNewSession: (workDir: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

export function Sidebar({
  sessions,
  workspaces,
  activeSession,
  activeWorkspaceId,
  onSelect,
  onPickWorkspace,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps): React.JSX.Element {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (session: SessionSummary): void => {
    setRenaming(session.id);
    setDraft(session.title);
  };

  const commitRename = (session: SessionSummary): void => {
    const title = draft.trim();
    setRenaming(null);
    if (title === '' || title === session.title) return;
    onRenameSession(session.id, title);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="wow-no-drag flex items-center justify-between px-3 py-3">
        <span className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">Workspaces</span>
        <button
          type="button"
          onClick={onPickWorkspace}
          aria-label="添加工作区"
          className="grid size-6 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          +
        </button>
      </div>

      <div className="wow-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {workspaces.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-ink-subtle">还没有工作区</p>
        ) : (
          workspaces.map((workspace) => (
            <div key={workspace.id} className="mb-3">
              <div className="group flex items-center gap-1 rounded-md px-2 py-1">
                <span
                  className={`min-w-0 flex-1 truncate text-[12px] ${
                    workspace.id === activeWorkspaceId ? 'text-ink' : 'text-ink-muted'
                  }`}
                  title={workspace.path}
                >
                  {workspace.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNewSession(workspace.path);
                  }}
                  aria-label={`在 ${workspace.name} 中新建会话`}
                  title="新建会话"
                  className="wow-no-drag grid size-5 shrink-0 place-items-center rounded text-[13px] text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-raised hover:text-ink"
                >
                  +
                </button>
              </div>
              {sessions
                .filter((session) => session.workDir === workspace.path)
                .map((session) =>
                  renaming === session.id ? (
                    <input
                      key={session.id}
                      autoFocus
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                      }}
                      onBlur={() => {
                        commitRename(session);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(session);
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                      aria-label="会话名称"
                      className="wow-no-drag mx-1 my-0.5 w-[calc(100%-8px)] rounded-md border border-accent/50 bg-canvas px-2 py-1 text-[13px] text-ink outline-none"
                    />
                  ) : (
                    <div key={session.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(session.id);
                        }}
                        onDoubleClick={() => {
                          startRename(session);
                        }}
                        className={`wow-no-drag block w-full truncate rounded-md px-2 py-1.5 pr-12 text-left text-[13px] transition-colors ${
                          session.id === activeSession
                            ? 'bg-surface-raised text-ink'
                            : 'text-ink-muted hover:bg-surface-raised/60 hover:text-ink'
                        }`}
                        title={`${session.title}（双击重命名）`}
                      >
                        {session.title}
                      </button>
                      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            startRename(session);
                          }}
                          aria-label={`重命名会话 ${session.title}`}
                          title="重命名"
                          className="wow-no-drag grid size-5 place-items-center rounded text-[11px] text-ink-subtle hover:text-ink"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSession(session.id);
                          }}
                          aria-label={`删除会话 ${session.title}`}
                          title="删除会话"
                          className="wow-no-drag grid size-5 place-items-center rounded text-[13px] text-ink-subtle hover:text-danger"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ),
                )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
