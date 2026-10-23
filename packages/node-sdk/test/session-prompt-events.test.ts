import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWowHarness, type ContextMessage, type Event, type WowHarness } from '#/index';

import { TEST_IDENTITY } from './test-identity';

const MODEL_URL = 'https://model.example.test/v1/chat/completions';

const fakeProviderState = vi.hoisted(() => ({
  calls: [] as Array<{
    readonly model: string | undefined;
    readonly systemPrompt: string;
    readonly history: unknown;
  }>,
  responseText: 'hello from fake provider',
  hang: false,
}));

function sseChunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-stub',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fake-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}`;
}

function sseBody(text: string): string {
  return [sseChunk({ role: 'assistant', content: text }), sseChunk({}, 'stop'), 'data: [DONE]']
    .map((line) => `${line}\n\n`)
    .join('');
}

let fetchStub: ReturnType<typeof vi.spyOn> | undefined;

const tempDirs: string[] = [];

beforeEach(() => {
  fakeProviderState.calls.length = 0;
  fakeProviderState.responseText = 'hello from fake provider';
  fakeProviderState.hang = false;
  fetchStub = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== MODEL_URL) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
      readonly model?: string;
      readonly messages?: ReadonlyArray<{ readonly role: string; readonly content: unknown }>;
    };
    const messages = body.messages ?? [];
    const system = messages.find((message) => message.role === 'system');
    fakeProviderState.calls.push({
      model: body.model,
      systemPrompt: typeof system?.content === 'string' ? system.content : '',
      history: messages,
    });
    if (fakeProviderState.hang) {
      // Never answers; settles only when the turn's request is aborted.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }
    return new Response(sseBody(fakeProviderState.responseText), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
});

afterEach(async () => {
  fetchStub?.mockRestore();
  fetchStub = undefined;
  for (const dir of tempDirs.splice(0)) {
    await removeTempDir(dir);
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wow-sdk-prompt-'));
  tempDirs.push(dir);
  return dir;
}

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

describe('Session.prompt events', () => {
  it('persists sanitized prompt metadata without marking the title custom', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ workDir });
      const events: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });

      let done = waitForEvent(session, (event) => event.type === 'turn.ended');
      await session.prompt('use api_key=secret-value for the request');
      await done;

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'session.meta.updated',
          title: 'use api_key=[redacted] for the request',
          patch: expect.objectContaining({
            isCustomTitle: false,
            lastPrompt: 'use api_key=[redacted] for the request',
          }),
        }),
      );

      events.length = 0;
      done = waitForEvent(session, (event) => event.type === 'turn.ended');
      await session.prompt('second prompt');
      await done;

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'session.meta.updated',
          patch: expect.objectContaining({
            lastPrompt: 'second prompt',
          }),
        }),
      );

      events.length = 0;
      done = waitForEvent(session, (event) => event.type === 'turn.ended');
      await session.prompt([{ type: 'image_url', imageUrl: { url: 'https://example.com/a.png' } }]);
      await done;
      unsubscribe();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'session.meta.updated',
          patch: expect.objectContaining({
            lastPrompt: '[image]',
          }),
        }),
      );
    } finally {
      await harness.close();
    }
  });

  it('emits mapped turn events through Session.onEvent', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ workDir });
      const events: Event[] = [];
      const done = waitForEvent(session, (event) => event.type === 'turn.ended');
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });

      await session.prompt('hello');
      await done;
      unsubscribe();

      expect(events.some((event) => event.type === 'turn.started')).toBe(true);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'assistant.delta',
          sessionId: session.id,
          turnId: 0,
          delta: 'hello from fake provider',
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'turn.ended',
          sessionId: session.id,
          turnId: 0,
          reason: 'completed',
        }),
      );
      expect(fakeProviderState.calls[0]?.systemPrompt).toContain('You are WoW');
      expect(fakeProviderState.calls[0]?.systemPrompt).toContain('Available skills');
    } finally {
      await harness.close();
    }
  });

  it('supports onEvent unsubscribe', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ workDir });
      const unsubscribedEvents: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        unsubscribedEvents.push(event);
      });
      unsubscribe();
      const done = waitForEvent(session, (event) => event.type === 'turn.ended');

      await session.prompt([{ type: 'text', text: 'hello' }]);
      await done;

      expect(unsubscribedEvents).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('serves the conversation through getContext, also after a restart', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    let harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ workDir });
      await runPrompt(session, 'first question', 'first answer');
      await runPrompt(session, 'second question', 'second answer');
      const expected = [
        'user:first question',
        'assistant:first answer',
        'user:second question',
        'assistant:second answer',
      ];
      expect(visibleText((await session.getContext()).history)).toEqual(expected);

      await harness.close();
      harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });
      const resumed = await harness.resumeSession({ id: session.id });
      expect(visibleText((await resumed.getContext()).history)).toEqual(expected);

      await runPrompt(resumed, 'third question', 'third answer');
      expect(visibleText((await resumed.getContext()).history)).toEqual([
        ...expected,
        'user:third question',
        'assistant:third answer',
      ]);
    } finally {
      await harness.close();
    }
  });

  it('switches the model of a live session with setModel', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      await harness.setConfig({
        models: {
          'other-model': { provider: 'local', model: 'other-model', maxContextSize: 262144 },
        },
      });
      const session = await harness.createSession({ workDir });
      await runPrompt(session, 'first', 'first answer');
      await session.setModel('other-model');
      await runPrompt(session, 'second', 'second answer');

      expect(fakeProviderState.calls.at(0)?.model).toBe('fake-model');
      expect(fakeProviderState.calls.at(-1)?.model).toBe('other-model');
      await expect(session.setModel('missing-model')).rejects.toMatchObject({
        code: 'config.invalid',
      });
    } finally {
      await harness.close();
    }
  });

  it('cancels the running turn', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ workDir });
      fakeProviderState.hang = true;
      const requested = vi.waitFor(
        () => {
          expect(fakeProviderState.calls).toHaveLength(1);
        },
        { timeout: 5_000 },
      );
      const ended = waitForEvent(session, (event) => event.type === 'turn.ended', 5_000);
      await session.prompt('never answered');
      await requested;
      await session.cancel();

      expect(await ended).toMatchObject({ reason: 'cancelled' });
    } finally {
      await harness.close();
    }
  });

  it('rejects empty prompt input', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = createWowHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      const session = await harness.createSession({ workDir });
      await expect(session.prompt('   ')).rejects.toMatchObject({
        name: 'WowError',
        code: 'request.prompt_input_empty',
      });
    } finally {
      await harness.close();
    }
  });
});

async function runPrompt(
  session: Parameters<typeof waitForEvent>[0] & { prompt(input: string): Promise<void> },
  input: string,
  response: string,
): Promise<void> {
  fakeProviderState.responseText = response;
  const done = waitForEvent(session, (event) => event.type === 'turn.ended');
  await session.prompt(input);
  await done;
}

/** The user prompts and assistant replies of a history, as `role:text`. */
function visibleText(history: readonly ContextMessage[]): readonly string[] {
  const entries: string[] = [];
  for (const message of history) {
    if (message.role === 'user' && message.origin !== undefined && message.origin.kind !== 'user') {
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text = message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    entries.push(`${message.role}:${text}`);
  }
  return entries;
}

async function configureFakeProvider(harness: WowHarness): Promise<void> {
  await harness.setConfig({
    providers: {
      local: {
        type: 'openai',
        baseUrl: 'https://model.example.test/v1',
        apiKey: 'sk-test',
      },
    },
    models: {
      'fake-model': {
        provider: 'local',
        model: 'fake-model',
        maxContextSize: 262144,
      },
    },
    defaultModel: 'fake-model',
  });
}

function waitForEvent(
  session: {
    onEvent(listener: (event: Event) => void): () => void;
  },
  predicate: (event: Event) => boolean,
  timeoutMs = 1_000,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for session event'));
    }, timeoutMs);
    const unsubscribe = session.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}
