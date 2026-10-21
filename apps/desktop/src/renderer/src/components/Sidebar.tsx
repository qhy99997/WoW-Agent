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
}: SidebarProps): React.JSX.Element {
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
                .map((session) => (
                  <div key={session.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(session.id);
                      }}
                      className={`wow-no-drag block w-full truncate rounded-md px-2 py-1.5 pr-7 text-left text-[13px] transition-colors ${
                        session.id === activeSession
                          ? 'bg-surface-raised text-ink'
                          : 'text-ink-muted hover:bg-surface-raised/60 hover:text-ink'
                      }`}
                      title={session.title}
                    >
                      {session.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteSession(session.id);
                      }}
                      aria-label={`删除会话 ${session.title}`}
                      title="删除会话"
                      className="wow-no-drag absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-[13px] text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
