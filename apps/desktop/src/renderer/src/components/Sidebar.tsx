import type { SessionSummary, Workspace } from '@shared/contract.js';

interface SidebarProps {
  sessions: SessionSummary[];
  workspaces: Workspace[];
  activeSession: string | null;
  activeWorkspaceId: string | null;
  onSelect: (sessionId: string) => void;
  onPickWorkspace: () => void;
}

export function Sidebar({
  sessions,
  workspaces,
  activeSession,
  activeWorkspaceId,
  onSelect,
  onPickWorkspace,
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
            <div key={workspace.id} className="mb-1">
              <div
                className={`truncate rounded-md px-2 py-1 text-[12px] ${
                  workspace.id === activeWorkspaceId ? 'text-ink' : 'text-ink-muted'
                }`}
                title={workspace.path}
              >
                {workspace.name}
              </div>
              {sessions
                .filter((session) => session.workDir === workspace.path)
                .map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className={`wow-no-drag block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                      session.id === activeSession
                        ? 'bg-surface-raised text-ink'
                        : 'text-ink-muted hover:bg-surface-raised/60 hover:text-ink'
                    }`}
                    title={session.title}
                  >
                    {session.title}
                  </button>
                ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
