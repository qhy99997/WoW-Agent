import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  drainQueryStoreDisposals,
  drainSessionIndexMirror,
  ISessionIndex,
  ISessionIndexMirror,
} from '@moonshot-ai/agent-core-v2';

import { createKimiHarness, SDKRpcClientV2 } from '#/index';

import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await removeTempDir(dir);
  }
});

async function removeTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY' && code !== 'EPERM') {
        throw error;
      }
      await delay(10);
    }
  }

  await rm(dir, { recursive: true, force: true });
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-sdk-list-'));
  tempDirs.push(dir);
  return dir;
}

describe('KimiHarness.listSessions', () => {
  it('lists the sessions of every workDir', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const otherWorkDir = await makeTempDir();
    const harness = createKimiHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      const first = await harness.createSession({ workDir });
      const second = await harness.createSession({ workDir: otherWorkDir });

      const sessions = await harness.listSessions();
      expect(sessions.map((session) => session.id).toSorted()).toEqual(
        [first.id, second.id].toSorted(),
      );
      expect(sessions.find((session) => session.id === first.id)?.workDir).toBe(workDir);
      expect(sessions.find((session) => session.id === second.id)?.workDir).toBe(otherWorkDir);
    } finally {
      await harness.close();
    }
  });

  it('keeps a workDir containing spaces and non-ASCII characters', async () => {
    const homeDir = await makeTempDir();
    const root = await makeTempDir();
    const workDir = join(root, 'Workspace With Spaces', '项目');
    await mkdir(workDir, { recursive: true });
    const harness = createKimiHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      const session = await harness.createSession({ workDir });

      const sessions = await harness.listSessions();
      expect(sessions.map((item) => [item.id, item.workDir])).toEqual([[session.id, workDir]]);
    } finally {
      await harness.close();
    }
  });

  it('resolves a relative workDir on create', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createKimiHarness({ identity: TEST_IDENTITY, homeDir });
    const originalCwd = process.cwd();

    try {
      process.chdir(workDir);
      const session = await harness.createSession({ workDir: '.' });
      expect(session.workDir).toBe(resolve(workDir));

      const sessions = await harness.listSessions();
      expect(sessions.map((item) => [item.id, item.workDir])).toEqual([
        [session.id, resolve(workDir)],
      ]);
    } finally {
      process.chdir(originalCwd);
      await harness.close();
    }
  });

  it('rejects a whitespace-only workDir on create', async () => {
    const homeDir = await makeTempDir();
    const harness = createKimiHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await expect(harness.createSession({ workDir: '   ' })).rejects.toMatchObject({
        name: 'KimiError',
        code: 'request.work_dir_required',
      });
    } finally {
      await harness.close();
    }
  });

  it('lists persisted sessions after the active Session has been closed', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createKimiHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      const session = await harness.createSession({ workDir });
      await session.close();

      const sessions = await harness.listSessions();
      expect(sessions.map((item) => item.id)).toEqual([session.id]);
    } finally {
      await harness.close();
    }
  });

  it('leaves out sessions whose workDir cannot be resolved (read model on)', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_FLAG', '0');
    vi.stubEnv('KIMI_CODE_PERSISTENCE_MINIDB_READMODEL', '1');
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const created: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const summary = await client.createSession({ workDir });
        await client.closeSession({ sessionId: summary.id });
        created.push(summary.id);
      }
      const index = client.engineAccessor.get(ISessionIndex);
      await index.prepare();
      // A summary whose workDir can no longer be resolved (unknown workspace,
      // no cwd) cannot be resumed, so the listing drops it.
      client.engineAccessor.get(ISessionIndexMirror).record({
        id: 'ses_ghost',
        workspaceId: 'ws_missing',
        createdAt: 1,
        updatedAt: Date.now() + 60_000,
        archived: false,
      });
      await drainSessionIndexMirror();

      const ids = (await client.listSessions()).map((item) => item.id);
      expect(ids.toSorted()).toEqual(created.toSorted());
    } finally {
      await client.close();
      // Dispose fired the mirror/query-store async closes; await them before
      // the shared afterEach removes the temp home.
      await drainSessionIndexMirror();
      await drainQueryStoreDisposals();
      vi.unstubAllEnvs();
    }
  });
});

describe('SDKRpcClientV2 search-index separation', () => {
  // Listing, resuming and continuing sessions go through `ISessionIndex`
  // alone and must never open the global full-text search database
  // (`<homeDir>/search-index`) — including while the session read model is
  // still preparing.

  it('listSessions / resumeSession never open the global search index (read model off)', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_FLAG', '0');
    vi.stubEnv('KIMI_CODE_PERSISTENCE_MINIDB_READMODEL', '0');
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const created = await client.createSession({ workDir });
      await client.closeSession({ sessionId: created.id });

      const sessions = await client.listSessions();
      expect(sessions.map((item) => item.id)).toEqual([created.id]);
      const resumed = await client.resumeSession({ id: created.id });
      expect(resumed.id).toBe(created.id);

      expect(existsSync(join(homeDir, 'search-index'))).toBe(false);
      // With the read model off, the session query-store is never opened either.
      expect(existsSync(join(homeDir, 'cache', 'query-store'))).toBe(false);
    } finally {
      await client.close();
      vi.unstubAllEnvs();
    }
  });

  it('listSessions / resumeSession never open the global search index (read model on)', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_FLAG', '0');
    vi.stubEnv('KIMI_CODE_PERSISTENCE_MINIDB_READMODEL', '1');
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const created = await client.createSession({ workDir });
      await client.closeSession({ sessionId: created.id });

      // The read model is still preparing here: the first list kicks the
      // background projection and answers from authoritative metadata, the
      // resume reads the authoritative document — neither waits for, nor
      // opens, any full-text index.
      const sessions = await client.listSessions();
      expect(sessions.map((item) => item.id)).toEqual([created.id]);
      const resumed = await client.resumeSession({ id: created.id });
      expect(resumed.id).toBe(created.id);

      expect(existsSync(join(homeDir, 'search-index'))).toBe(false);

      // Settle the kicked projection before close so teardown never races it,
      // and prove the read model really did engage (the flag took effect).
      const status = await client.engineAccessor.get(ISessionIndex).prepare();
      expect(status.state).toBe('ready');
      expect(existsSync(join(homeDir, 'cache', 'query-store'))).toBe(true);
      expect(existsSync(join(homeDir, 'search-index'))).toBe(false);
    } finally {
      await client.close();
      // Dispose fired the mirror/query-store async closes; await them before
      // the shared afterEach removes the temp home.
      await drainSessionIndexMirror();
      await drainQueryStoreDisposals();
      vi.unstubAllEnvs();
    }
  });
});
