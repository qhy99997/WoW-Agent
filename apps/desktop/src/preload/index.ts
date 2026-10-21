import { contextBridge, ipcRenderer } from 'electron';

import { EVENTS, IPC, type WowBridge } from '../shared/bridge';
import type { RpcResult } from '../shared/contract';
import { unwrap } from '../shared/rpc';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as RpcResult<T>;
  // `unwrap` packs the code and hint into the message: a custom property on the
  // Error would be stripped as it crosses the isolated-world boundary.
  return unwrap(result);
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: WowBridge = {
  doctor: {
    run: () => call(IPC.doctorRun),
  },
  workspace: {
    pick: () => call(IPC.workspacePick),
    list: () => call(IPC.workspaceList),
  },
  session: {
    list: () => call(IPC.sessionList),
    create: (workDir) => call(IPC.sessionCreate, workDir),
    delete: (sessionId) => call(IPC.sessionDelete, sessionId),
    rename: (sessionId, title) => call(IPC.sessionRename, sessionId, title),
    transcript: (sessionId) => call(IPC.sessionTranscript, sessionId),
    setModel: (sessionId, alias) => call(IPC.sessionSetModel, sessionId, alias),
  },
  prompt: {
    send: (sessionId, text) => call(IPC.promptSend, sessionId, text),
    cancel: (sessionId) => call(IPC.promptCancel, sessionId),
  },
  approval: {
    respond: (approvalId, optionId) => call(IPC.approvalRespond, approvalId, optionId),
  },
  question: {
    respond: (questionId, answer) => call(IPC.questionRespond, questionId, answer),
  },
  settings: {
    snapshot: () => call(IPC.settingsSnapshot),
  },
  models: {
    list: () => call(IPC.modelsList),
    add: (input) => call(IPC.modelAdd, input),
    remove: (alias) => call(IPC.modelRemove, alias),
    setDefault: (alias) => call(IPC.defaultModelSet, alias),
  },
  provider: {
    upsert: (config) => call(IPC.providerUpsert, config),
    remove: (name) => call(IPC.providerRemove, name),
    test: (config) => call(IPC.providerTest, config),
  },
  mcp: {
    list: (workDir) => call(IPC.mcpList, workDir),
    add: (input, workDir) => call(IPC.mcpAdd, input, workDir),
    remove: (name, workDir) => call(IPC.mcpRemove, name, workDir),
    test: (input, workDir) => call(IPC.mcpTest, input, workDir),
  },
  on: {
    streamDelta: (listener) => subscribe(EVENTS.streamDelta, listener),
    approvalRequested: (listener) => subscribe(EVENTS.approvalRequested, listener),
    questionAsked: (listener) => subscribe(EVENTS.questionAsked, listener),
    sessionChanged: (listener) => subscribe(EVENTS.sessionChanged, listener),
  },
};

contextBridge.exposeInMainWorld('wow', bridge);
