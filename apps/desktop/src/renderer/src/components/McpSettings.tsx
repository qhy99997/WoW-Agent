import { useCallback, useEffect, useState } from 'react';

import type { AddMcpServerInput, McpServerSummary } from '@shared/contract';
import { describeError } from '@shared/rpc';
import { bridge } from '../bridge';

interface McpSettingsProps {
  workDir: string | undefined;
}

type Transport = 'stdio' | 'http' | 'sse';

export function McpSettings({ workDir }: McpSettingsProps): React.JSX.Element {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');

  const refresh = useCallback(async () => {
    setServers(await bridge().mcp.list(workDir));
  }, [workDir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const build = (): AddMcpServerInput => ({
    name: name.trim(),
    transport,
    command: transport === 'stdio' ? command.trim() : undefined,
    args:
      transport === 'stdio' && args.trim() !== ''
        ? args.trim().split(/\s+/)
        : undefined,
    url: transport === 'stdio' ? undefined : url.trim(),
  });

  const run = useCallback(
    async (action: () => Promise<void>, okText: string) => {
      setBusy(true);
      setMessage(null);
      try {
        await action();
        await refresh();
        setMessage({ kind: 'ok', text: okText });
      } catch (cause) {
        setMessage({ kind: 'error', ...describeError(cause) });
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <section>
      <h3 className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">MCP 服务器</h3>
      <p className="mt-1 text-[12px] text-ink-muted">
        接入外部工具。stdio 走本地命令，http / sse 走远程地址。
      </p>

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1">
          <span className="text-[12px] text-ink-muted">名称</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="my-server"
            className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-[12px] text-ink-muted">传输方式</span>
          <select
            value={transport}
            onChange={(event) => {
              setTransport(event.target.value as Transport);
            }}
            className="rounded-control border border-hairline bg-surface px-3 py-2 text-[13px] outline-none focus:border-ink-subtle"
          >
            <option value="stdio">stdio（本地命令）</option>
            <option value="http">http（远程）</option>
            <option value="sse">sse（远程）</option>
          </select>
        </label>

        {transport === 'stdio' ? (
          <>
            <label className="grid gap-1">
              <span className="text-[12px] text-ink-muted">命令</span>
              <input
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                }}
                placeholder="npx"
                className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] text-ink-muted">参数（空格分隔）</span>
              <input
                value={args}
                onChange={(event) => {
                  setArgs(event.target.value);
                }}
                placeholder="-y @modelcontextprotocol/server-filesystem C:\\path"
                className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
              />
            </label>
          </>
        ) : (
          <label className="grid gap-1">
            <span className="text-[12px] text-ink-muted">URL</span>
            <input
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
              placeholder="https://example.com/mcp"
              className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
            />
          </label>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || name.trim() === ''}
          onClick={() => {
            void run(async () => {
              await bridge().mcp.add(build(), workDir);
              setName('');
              setCommand('');
              setArgs('');
              setUrl('');
            }, 'MCP 服务器已添加');
          }}
          className="rounded-control bg-accent px-3 py-1.5 text-[12px] font-medium text-canvas transition-opacity disabled:opacity-40"
        >
          添加
        </button>
        <button
          type="button"
          disabled={busy || name.trim() === ''}
          onClick={() => {
            setBusy(true);
            setMessage(null);
            void bridge()
              .mcp.test(build(), workDir)
              .then((result) => {
                setMessage({
                  kind: result.ok ? 'ok' : 'error',
                  text: result.detail,
                });
              })
              .catch((cause: unknown) => {
                setMessage({ kind: 'error', ...describeError(cause) });
              })
              .finally(() => {
                setBusy(false);
              });
          }}
          className="rounded-control border border-hairline px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          测试连接
        </button>
      </div>

      {message !== null && (
        <div
          className={`mt-2 rounded-control px-3 py-2 text-[12px] ${
            message.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}
        >
          <p>{message.text}</p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {servers.length === 0 ? (
          <p className="text-[12px] text-ink-subtle">还没有 MCP 服务器。</p>
        ) : (
          servers.map((server) => (
            <div
              key={server.name}
              className="flex items-center justify-between rounded-card border border-hairline bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px]">
                  {server.name}
                  {!server.enabled && (
                    <span className="ml-2 text-[10px] tracking-wide text-ink-subtle uppercase">
                      已停用
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[11px] text-ink-subtle">
                  {server.transport} · {server.detail}
                </p>
              </div>
              {server.mutable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      await bridge().mcp.remove(server.name, workDir);
                    }, `已删除 ${server.name}`);
                  }}
                  className="shrink-0 rounded-control px-2 py-1 text-[11px] text-ink-muted transition-colors hover:text-danger"
                >
                  删除
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
