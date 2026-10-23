import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AgentHost, type EventSink } from '../src/main/agentHost';
import type { ApprovalRequest, QuestionRequest, StreamDelta } from '../src/shared/contract';

interface RecordedCompletionRequest {
  readonly headers: IncomingMessage['headers'];
  readonly model: string | undefined;
  readonly systemPrompt: string;
  readonly toolNames: readonly string[];
  readonly messages: ReadonlyArray<{
    readonly role: string;
    readonly content?: unknown;
  }>;
}

function sseChunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-smoke',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'gpt-smoke',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

const tempDirs: string[] = [];
const previousWowHome = process.env['WOW_HOME'];

afterEach(async () => {
  if (previousWowHome === undefined) {
    delete process.env['WOW_HOME'];
  } else {
    process.env['WOW_HOME'] = previousWowHome;
  }
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('Desktop + SDK end-to-end smoke', () => {
  it('runs a full session lifecycle with tool approval and restart persistence over a local OpenAI server', async () => {
    const homeDir = await makeTempDir('wow-smoke-home-');
    const workspaceRoot = await makeTempDir('wow-smoke-work-');
    const workDir = join(workspaceRoot, 'Workspace With Spaces', '项目');
    await mkdir(workDir, { recursive: true });
    process.env['WOW_HOME'] = homeDir;

    const targetFile = join(workDir, 'note.txt');
    const completionRequests: RecordedCompletionRequest[] = [];
    const unexpectedPaths: string[] = [];

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '';
      if (req.method === 'GET' && url === '/v1/models') {
        if (req.headers.authorization !== 'Bearer sk-smoke') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-smoke' }] }));
        return;
      }

      if (req.method === 'POST' && url === '/v1/chat/completions') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            readonly model?: string;
            readonly messages?: ReadonlyArray<{ readonly role: string; readonly content?: unknown }>;
            readonly tools?: ReadonlyArray<{ readonly function?: { readonly name?: string } }>;
          };
          const messages = body.messages ?? [];
          const system = messages.find((message) => message.role === 'system');
          const toolNames = (body.tools ?? [])
            .map((tool) => tool.function?.name)
            .filter((name): name is string => typeof name === 'string');

          completionRequests.push({
            headers: req.headers,
            model: body.model,
            systemPrompt: typeof system?.content === 'string' ? system.content : '',
            toolNames,
            messages,
          });

          const hasToolResult = messages.some((message) => message.role === 'tool');
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          if (!hasToolResult) {
            const toolArgs = JSON.stringify({
              path: targetFile,
              content: 'hello from smoke',
            });
            res.write(sseChunk({ role: 'assistant', reasoning_content: 'checking workspace' }));
            res.write(
              sseChunk({
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_write_1',
                    type: 'function',
                    function: { name: 'Write', arguments: toolArgs },
                  },
                ],
              }),
            );
            res.write(sseChunk({}, 'tool_calls'));
            res.end('data: [DONE]\n\n');
            return;
          }

          res.write(sseChunk({ role: 'assistant', content: 'wrote ' }));
          res.write(sseChunk({ content: 'note.txt' }));
          res.write(sseChunk({}, 'stop'));
          res.end('data: [DONE]\n\n');
        });
        return;
      }

      unexpectedPaths.push(`${req.method ?? 'GET'} ${url}`);
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${String(port)}/v1`;

    let host = new AgentHost();
    try {
      const doctor = await host.doctor();
      expect(doctor.ok).toBe(true);

      const providerConfig = {
        name: 'local',
        wireType: 'openai' as const,
        baseUrl,
        apiKey: 'sk-smoke',
      };
      const probe = await host.testProvider(providerConfig);
      expect(probe).toEqual({ ok: true, detail: 'HTTP 200' });

      await host.upsertProvider(providerConfig);
      await host.addModel({
        provider: 'local',
        model: 'gpt-smoke',
        displayName: 'GPT Smoke',
        maxContextSize: 128_000,
        capabilities: ['thinking'],
      });

      const snapshot = await host.settingsSnapshot();
      expect(snapshot.defaultModel).toBe('local/gpt-smoke');
      expect(snapshot.providers).toEqual([
        {
          name: 'local',
          wireType: 'openai',
          baseUrl,
          hasApiKey: true,
          modelAliases: ['local/gpt-smoke'],
        },
      ]);

      const workspace = host.addWorkspace(workDir);
      const created = await host.createSession(workDir);
      expect(created.workDir).toBe(workspace.path);

      const deltas: StreamDelta[] = [];
      const approvals: ApprovalRequest[] = [];
      const questions: QuestionRequest[] = [];
      let resolveTurnSettled: () => void = () => undefined;
      const turnSettled = new Promise<void>((resolve) => {
        resolveTurnSettled = resolve;
      });

      const sink: EventSink = {
        onDelta(delta) {
          deltas.push(delta);
        },
        onApproval(request) {
          approvals.push(request);
          queueMicrotask(() => {
            host.respondApproval(request.id, 'allow_once');
          });
        },
        onQuestion(request) {
          questions.push(request);
        },
        onSessionChanged() {
          resolveTurnSettled();
        },
      };
      host.setSink(sink);

      await host.sendPrompt(created.id, 'write note.txt');
      await turnSettled;

      expect(unexpectedPaths).toEqual([]);
      expect(questions).toEqual([]);
      expect(approvals).toHaveLength(1);
      expect(approvals[0]?.title).toContain('Write');
      expect(await readFile(targetFile, 'utf8')).toBe('hello from smoke');

      expect(completionRequests).toHaveLength(2);
      const firstReq = completionRequests[0]!;
      expect(firstReq.model).toBe('gpt-smoke');
      expect(firstReq.headers['user-agent']).toMatch(/^WoW\//);
      expect(firstReq.headers.authorization).toBe('Bearer sk-smoke');
      expect(firstReq.systemPrompt).toContain('You are WoW');
      expect(firstReq.toolNames).toContain('Write');
      expect(firstReq.toolNames).toContain('FetchURL');
      expect(firstReq.toolNames).not.toContain('WebSearch');

      expect(deltas.some((delta) => delta.role === 'user' && delta.text === 'write note.txt')).toBe(
        true,
      );
      expect(
        deltas.some(
          (delta) => delta.role === 'assistant' && delta.kind === 'thinking' && delta.text.includes('checking workspace'),
        ),
      ).toBe(true);
      expect(
        deltas.some((delta) => delta.role === 'tool' && delta.text === 'Write' && delta.status === 'ok'),
      ).toBe(true);

      const listedSessions = await host.listSessions();
      expect(listedSessions).toHaveLength(1);
      expect(listedSessions[0]?.workDir).toBe(workDir);

      await host.dispose();

      host = new AgentHost();
      const workspacesAfterRestart = await host.listWorkspaces();
      const sessionsAfterRestart = await host.listSessions();
      expect(workspacesAfterRestart.map((item) => item.path)).toEqual([workDir]);
      expect(sessionsAfterRestart.map((item) => item.workDir)).toEqual([workDir]);

      const history = await host.transcript(created.id);
      expect(history.map((entry) => [entry.role, entry.kind, entry.text, entry.metadata?.status])).toEqual([
        ['user', 'text', 'write note.txt', undefined],
        ['tool', 'tool-call', 'Write', 'ok'],
        ['assistant', 'text', 'wrote note.txt', undefined],
      ]);

      await host.renameSession(created.id, 'Smoke Session');
      expect((await host.listSessions())[0]?.title).toBe('Smoke Session');

      await host.deleteSession(created.id);
      expect(await host.listSessions()).toEqual([]);
    } finally {
      await host.dispose();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
