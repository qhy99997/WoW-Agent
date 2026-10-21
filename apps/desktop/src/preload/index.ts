import { contextBridge, ipcRenderer } from 'electron';

import { EVENTS, IPC, type WowBridge } from '../shared/bridge.js';
import type { RpcResult } from '../shared/contract.js';

function unwrap<T>(result: RpcResult<T>): T {
  if (result.ok) return result.value;
  const error = new Error(result.error.message);
  error.name = result.error.code;
  throw error;
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as RpcResult<T>;
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
    run: async () => await call(IPC.doctorRun),
  },
  workspace: {
    pick: async () => await call(IPC.workspacePick),
    list: async () => await call(IPC.workspaceList),
  },
  session: {
    list: async () => await call(IPC.sessionList),
    create: async (workDir) => await call(IPC.sessionCreate, workDir),
    delete: async (sessionId) => await call(IPC.sessionDelete, sessionId),
    rename: async (sessionId, title) => await call(IPC.sessionRename, sessionId, title),
    transcript: async (sessionId) => await call(IPC.sessionTranscript, sessionId),
  },
  prompt: {
    send: async (sessionId, text) => await call(IPC.promptSend, sessionId, text),
    cancel: async (sessionId) => await call(IPC.promptCancel, sessionId),
  },
  approval: {
    respond: async (approvalId, optionId) => await call(IPC.approvalRespond, approvalId, optionId),
  },
  question: {
    respond: async (questionId, answer) => await call(IPC.questionRespond, questionId, answer),
  },
  models: {
    list: async () => await call(IPC.modelsList),
  },
  provider: {
    upsert: async (config) => await call(IPC.providerUpsert, config),
    test: async (config) => await call(IPC.providerTest, config),
  },
  on: {
    streamDelta: (listener) => subscribe(EVENTS.streamDelta, listener),
    approvalRequested: (listener) => subscribe(EVENTS.approvalRequested, listener),
    questionAsked: (listener) => subscribe(EVENTS.questionAsked, listener),
    sessionChanged: (listener) => subscribe(EVENTS.sessionChanged, listener),
  },
};

contextBridge.exposeInMainWorld('wow', bridge);
