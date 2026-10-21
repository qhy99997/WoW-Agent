import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { join } from 'node:path';

import { AgentHost } from './agentHost.js';
import {
  EVENTS,
  IPC,
  type WowBridge,
} from '../shared/bridge.js';
import type { RpcResult } from '../shared/contract.js';

const host = new AgentHost();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B0B0C' : '#FAFAF9',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B0B0C', symbolColor: '#E7E5E4', height: 40 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

function emit(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

host.setSink({
  onDelta: (delta) => {
    emit(EVENTS.streamDelta, delta);
  },
  onApproval: (request) => {
    emit(EVENTS.approvalRequested, request);
  },
  onQuestion: (request) => {
    emit(EVENTS.questionAsked, request);
  },
  onSessionChanged: () => {
    emit(EVENTS.sessionChanged, null);
  },
});

async function guard<T>(run: () => Promise<T> | T): Promise<RpcResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: 'internal', message } };
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.doctorRun, async () => await guard(() => host.doctor()));

  ipcMain.handle(IPC.workspaceList, () => guard(() => host.listWorkspaces()));

  ipcMain.handle(
    IPC.workspacePick,
    async () =>
      await guard(async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
        });
        const picked = result.filePaths[0];
        if (result.canceled || picked === undefined) return null;
        return host.addWorkspace(picked);
      }),
  );

  ipcMain.handle(IPC.sessionList, async () => await guard(() => host.listSessions()));
  ipcMain.handle(IPC.sessionCreate, async (_event, workDir: string) =>
    await guard(() => host.createSession(workDir)),
  );
  ipcMain.handle(IPC.sessionDelete, async (_event, sessionId: string) =>
    await guard(() => host.deleteSession(sessionId)),
  );
  ipcMain.handle(IPC.sessionRename, async (_event, sessionId: string, title: string) =>
    await guard(() => host.renameSession(sessionId, title)),
  );
  ipcMain.handle(IPC.sessionTranscript, (_event, sessionId: string) =>
    guard(() => host.transcript(sessionId)),
  );
  ipcMain.handle(IPC.sessionSetModel, async (_event, sessionId: string, alias: string) =>
    await guard(() => host.setSessionModel(sessionId, alias)),
  );

  ipcMain.handle(IPC.promptSend, async (_event, sessionId: string, text: string) =>
    await guard(() => host.sendPrompt(sessionId, text)),
  );
  ipcMain.handle(IPC.promptCancel, async (_event, sessionId: string) =>
    await guard(() => host.cancelPrompt(sessionId)),
  );

  ipcMain.handle(IPC.approvalRespond, (_event, approvalId: string, optionId: string) =>
    guard(() => {
      host.respondApproval(approvalId, optionId);
    }),
  );
  ipcMain.handle(IPC.questionRespond, (_event, questionId: string, answer: string) =>
    guard(() => {
      host.respondQuestion(questionId, answer);
    }),
  );

  ipcMain.handle(IPC.settingsSnapshot, async () => await guard(() => host.settingsSnapshot()));
  ipcMain.handle(IPC.modelsList, async () => await guard(() => host.listModels()));
  ipcMain.handle(IPC.modelAdd, async (_event, input: Parameters<typeof host.addModel>[0]) =>
    await guard(() => host.addModel(input)),
  );
  ipcMain.handle(IPC.modelRemove, async (_event, alias: string) =>
    await guard(() => host.removeModel(alias)),
  );
  ipcMain.handle(IPC.defaultModelSet, async (_event, alias: string) =>
    await guard(() => host.setDefaultModel(alias)),
  );
  ipcMain.handle(IPC.providerUpsert, async (_event, config: Parameters<typeof host.upsertProvider>[0]) =>
    await guard(() => host.upsertProvider(config)),
  );
  ipcMain.handle(IPC.providerRemove, async (_event, name: string) =>
    await guard(() => host.deleteProvider(name)),
  );
  ipcMain.handle(IPC.providerTest, async (_event, config: Parameters<typeof host.testProvider>[0]) =>
    await guard(() => host.testProvider(config)),
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    void host.dispose();
  });
}

export type { WowBridge };
