/**
 * Scenario: the harness over the in-process agent-core-v2 engine.
 * Responsibilities: shutdown ordering, host request headers, session
 * lifecycle serialization, rename / delete, the config write paths and the
 * MCP management plane.
 * Wiring: real engine bootstrapped on a temp WOW_HOME; no network.
 * Run: pnpm exec vitest run test/sdk-rpc-client-v2.test.ts
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  drainQueryStoreDisposals,
  drainSessionIndexMirror,
  IHostRequestHeaders,
  IMcpOAuthService,
} from '@wow/agent-core-v2';
import { McpOAuthService } from '@wow/agent-core-v2/mcpCore/oauth/service';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWowHarness, ErrorCodes, SDKRpcClientV2, type WowHarness } from '#/index';

import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  // The read-model mirror/query-store close asynchronously on dispose; await
  // the drains so the rm below never races their final flush (ENOTEMPTY).
  await drainSessionIndexMirror();
  await drainQueryStoreDisposals();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function makeHarness(): Promise<{
  harness: WowHarness;
  homeDir: string;
  workDir: string;
}> {
  const homeDir = await makeTempDir('wow-sdk-v2-');
  const workDir = await makeTempDir('wow-sdk-v2-work-');
  return { harness: createWowHarness({ homeDir, identity: TEST_IDENTITY }), homeDir, workDir };
}

/** Whether the persisted session directory exists under `<home>/sessions/<bucket>/<id>`. */
async function sessionDirExists(homeDir: string, sessionId: string): Promise<boolean> {
  let buckets: readonly string[];
  try {
    buckets = await readdir(join(homeDir, 'sessions'));
  } catch {
    return false;
  }
  for (const bucket of buckets) {
    try {
      await readdir(join(homeDir, 'sessions', bucket, sessionId));
      return true;
    } catch {
      // Not under this bucket.
    }
  }
  return false;
}

const PROVIDERS = {
  a: { type: 'openai', baseUrl: 'https://a.example.test/v1', apiKey: 'sk-a' },
  b: { type: 'openai', baseUrl: 'https://b.example.test/v1', apiKey: 'sk-b' },
} as const;

describe('SDKRpcClientV2 lifecycle', () => {
  it('close() awaits the MCP OAuth service shutdown', async () => {
    const homeDir = await makeTempDir('wow-sdk-v2-');
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    // Activate the OnDemand OAuth service, then gate its shutdown behind a
    // manual release: close() alone must trigger and await that shutdown, so
    // a host removing homeDir right after close() cannot race token writes.
    client.engineAccessor.get(IMcpOAuthService);
    let releaseShutdown: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    const baseShutdown = McpOAuthService.prototype.shutdown;
    const shutdownSpy = vi
      .spyOn(McpOAuthService.prototype, 'shutdown')
      .mockImplementation(function (this: McpOAuthService) {
        return baseShutdown.call(this).then(() => gate);
      });
    try {
      let closed = false;
      const closePromise = client.close().then(() => {
        closed = true;
      });
      await vi.waitFor(() => {
        expect(shutdownSpy).toHaveBeenCalled();
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
      releaseShutdown();
      await closePromise;
      expect(closed).toBe(true);
    } finally {
      releaseShutdown();
      shutdownSpy.mockRestore();
    }
  });

  it('close() resolves promptly when the MCP OAuth service was never used', async () => {
    const homeDir = await makeTempDir('wow-sdk-v2-');
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('seeds the host request headers (User-Agent + X-Msh-*) into the engine', async () => {
    const homeDir = await makeTempDir('wow-sdk-v2-');
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const headers = client.engineAccessor.get(IHostRequestHeaders).headers;
      expect(headers['User-Agent']).toBe(`wow-desktop/${TEST_IDENTITY.version}`);
      expect(headers['X-Msh-Platform']).toBe('wow_desktop');
      expect(headers['X-Msh-Version']).toBe(TEST_IDENTITY.version);
      expect(headers['X-Msh-Device-Id']).toBeTruthy();
    } finally {
      await client.close();
    }
  });
});

describe('WowHarness sessions', () => {
  it('re-resumes a fresh session facade while the public close is in flight', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ workDir });
      // close() flips `isClosed` synchronously; the engine close settles
      // asynchronously. The public resume must not hand back the closing
      // facade — it queues behind the close and materializes a fresh one.
      const closing = session.close();
      const resumed = await harness.resumeSession({ id: session.id });
      await closing;

      expect(resumed).not.toBe(session);
      expect(session.isClosed).toBe(true);
      expect(resumed.isClosed).toBe(false);
      // The stale facade's late onClose must not evict the live session.
      await expect(harness.resumeSession({ id: session.id })).resolves.toBe(resumed);
    } finally {
      await harness.close();
    }
  });

  it('coalesces concurrent public resumes onto one session facade', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ workDir });
      await session.close();

      const [first, second] = await Promise.all([
        harness.resumeSession({ id: session.id }),
        harness.resumeSession({ id: session.id }),
      ]);

      // One engine handle, one facade: a later close on either reference
      // must not strand a second live facade over the same handle.
      expect(first).toBe(second);
    } finally {
      await harness.close();
    }
  });

  it('renames live and closed sessions and rejects an empty title', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ workDir });
      await harness.renameSession({ id: session.id, title: '  我的标题  ' });
      await session.close();

      const resumed = await harness.resumeSession({ id: session.id });
      expect(resumed.summary).toMatchObject({ title: '我的标题', titleKind: 'custom' });
      await resumed.close();

      // A session that is not live is resumed, renamed and closed again.
      await harness.renameSession({ id: session.id, title: 'Renamed while closed' });
      const reopened = await harness.resumeSession({ id: session.id });
      expect(reopened.summary?.title).toBe('Renamed while closed');

      await expect(harness.renameSession({ id: session.id, title: '   ' })).rejects.toMatchObject({
        code: ErrorCodes.SESSION_TITLE_EMPTY,
      });
    } finally {
      await harness.close();
    }
  });

  it('deleteSession removes a session and rejects a missing id with session_not_found', async () => {
    const { harness, homeDir, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ workDir });
      await harness.deleteSession(session.id);
      await expect(harness.resumeSession({ id: session.id })).rejects.toMatchObject({
        code: ErrorCodes.SESSION_NOT_FOUND,
      });
      expect(await sessionDirExists(homeDir, session.id)).toBe(false);
      await expect(harness.deleteSession('session_missing')).rejects.toMatchObject({
        code: ErrorCodes.SESSION_NOT_FOUND,
      });
    } finally {
      await harness.close();
    }
  });
});

describe('WowHarness config', () => {
  it('persists removeProvider as one atomic cascade (providers, models, defaults)', async () => {
    const { harness } = await makeHarness();
    try {
      await harness.setConfig({
        providers: PROVIDERS,
        models: {
          'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
          'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
        },
        defaultModel: 'b/m1',
        defaultProvider: 'b',
      });
      const next = await harness.removeProvider('b');
      expect(next.providers['b']).toBeUndefined();
      expect(next.providers['a']).toBeDefined();
      expect(next.models?.['b/m1']).toBeUndefined();
      expect(next.models?.['a/m1']).toBeDefined();
      expect(next.defaultModel).toBeUndefined();
      expect(next.defaultProvider).toBeUndefined();
      // A fresh read from disk sees the same state — the cascade landed as a
      // single write, never a halfway-removed intermediate.
      const reread = await harness.getConfig({ reload: true });
      expect(reread.providers['b']).toBeUndefined();
      expect(reread.models?.['b/m1']).toBeUndefined();
      expect(reread.defaultModel).toBeUndefined();
      expect(reread.defaultProvider).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('replaceConfigSection drops the keys a deep-merging setConfig would keep', async () => {
    const { harness, homeDir } = await makeHarness();
    try {
      await harness.setConfig({
        providers: PROVIDERS,
        models: {
          'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
          'a/m2': { provider: 'a', model: 'm2', maxContextSize: 100 },
        },
      });
      const merged = await harness.setConfig({
        models: { 'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 } },
      });
      expect(Object.keys(merged.models ?? {}).toSorted()).toEqual(['a/m1', 'a/m2']);

      const replaced = await harness.replaceConfigSection('models', {
        'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
      });
      expect(Object.keys(replaced.models ?? {})).toEqual(['a/m1']);
      const reread = await harness.getConfig({ reload: true });
      expect(Object.keys(reread.models ?? {})).toEqual(['a/m1']);
      expect(await readFile(join(homeDir, 'config.toml'), 'utf-8')).not.toContain('m2');
    } finally {
      await harness.close();
    }
  });
});

describe('WowHarness MCP management', () => {
  it('adds, lists, probes and removes a user MCP server', async () => {
    const { harness, homeDir, workDir } = await makeHarness();
    try {
      const before = await harness.listMcpServers({ cwd: workDir });
      expect(before.some((server) => server.name === 'demo')).toBe(false);

      const added = await harness.addMcpServer(
        { name: 'demo', transport: 'stdio', command: 'node', args: ['server.js'] },
        { cwd: workDir },
      );
      expect(added).toContainEqual(
        expect.objectContaining({
          name: 'demo',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          mutable: true,
        }),
      );
      expect(await readFile(join(homeDir, 'mcp.json'), 'utf-8')).toContain('"demo"');

      const probe = await harness.testMcpServerConfig(
        { name: 'broken', transport: 'stdio', command: 'definitely-not-a-command-xyz' },
        { cwd: workDir },
      );
      expect(probe.success).toBe(false);

      const removed = await harness.removeMcpServer('demo', { cwd: workDir });
      expect(removed.some((server) => server.name === 'demo')).toBe(false);
    } finally {
      await harness.close();
    }
  });
});
