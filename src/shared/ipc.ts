/** Typed IPC channel names. Keep in sync with preload. */
export const IPC = {
  appInfo: 'app:info',
  appMinimize: 'app:minimize',
  appToggleMaximize: 'app:toggle-maximize',
  appClose: 'app:close',
  appOpenExternal: 'app:open-external',
  appShowItem: 'app:show-item',
  appPickDirectory: 'app:pick-directory',
  appPickFiles: 'app:pick-files',
  appOpenPath: 'app:open-path',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  providerUpdate: 'provider:update',
  providerRemove: 'provider:remove',
  providerTest: 'provider:test',

  sessionsList: 'sessions:list',
  sessionsCreate: 'sessions:create',
  sessionsGet: 'sessions:get',
  sessionsRename: 'sessions:rename',
  sessionsRemove: 'sessions:remove',
  sessionsSetModel: 'sessions:set-model',
  sessionsSetMode: 'sessions:set-mode',

  chatSend: 'chat:send',
  chatStop: 'chat:stop',
  chatApproval: 'chat:approval',
  chatAnswer: 'chat:answer',
  chatCompact: 'chat:compact',
  chatRevertTurn: 'chat:revert-turn',

  workspaceTree: 'workspace:tree',
  workspacePreview: 'workspace:preview',
  workspaceGitChanges: 'workspace:git-changes',

  libraryList: 'library:list',
  libraryAdd: 'library:add',
  libraryRemove: 'library:remove',

  skillsList: 'skills:list',
  skillsOpen: 'skills:open',

  tasksList: 'tasks:list',
  tasksStop: 'tasks:stop',

  changesList: 'changes:list',

  event: 'wow:event'
} as const
