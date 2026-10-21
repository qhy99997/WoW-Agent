import { useCallback, useEffect, useState } from 'react';

import type { SettingsSnapshot } from '@shared/contract';
import { bridge } from '../bridge';
import { McpSettings } from './McpSettings';

type WireType = 'openai' | 'anthropic' | 'kimi' | 'google-genai' | 'openai_responses';

const WIRE_PRESETS: Array<{ type: WireType; label: string; baseUrl: string }> = [
  { type: 'openai', label: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1' },
  { type: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
  { type: 'google-genai', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { type: 'openai_responses', label: 'OpenAI Responses', baseUrl: 'https://api.openai.com/v1' },
  { type: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
];

interface SettingsProps {
  onClose: () => void;
  workDir: string | undefined;
}

export function Settings({ onClose, workDir }: SettingsProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [name, setName] = useState('custom');
  const [wireType, setWireType] = useState<WireType>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');

  const refresh = useCallback(async () => {
    setSnapshot(await bridge().settings.snapshot());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>, okText: string) => {
      setBusy(true);
      setMessage(null);
      try {
        await action();
        await refresh();
        setMessage({ kind: 'ok', text: okText });
      } catch (cause) {
        setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) });
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const saveProvider = (): void => {
    void run(async () => {
      await bridge().provider.upsert({
        name: name.trim(),
        wireType,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() === '' ? undefined : apiKey.trim(),
      });
      if (modelId.trim() !== '') {
        await bridge().models.add({ provider: name.trim(), model: modelId.trim() });
      }
      setApiKey('');
      setModelId('');
    }, 'Provider 已保存');
  };

  const testProvider = (): void => {
    setBusy(true);
    setMessage(null);
    void bridge()
      .provider.test({ name: name.trim(), wireType, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() })
      .then((result) => {
        setMessage({ kind: result.ok ? 'ok' : 'error', text: result.detail });
      })
      .catch((cause: unknown) => {
        setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-4">
        <h2 className="text-[13px] font-medium">设置 · 模型</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          返回
        </button>
      </header>

      <div className="wow-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-6">
          <section>
            <h3 className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">添加 Provider</h3>
            <p className="mt-1 text-[12px] text-ink-muted">
              填好 API Key 即可使用，无需登录任何账号。
            </p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[12px] text-ink-muted">名称</span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  className="rounded-control border border-hairline bg-surface px-3 py-2 text-[13px] outline-none focus:border-ink-subtle"
                  placeholder="custom"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] text-ink-muted">协议</span>
                <select
                  value={wireType}
                  onChange={(event) => {
                    const next = event.target.value as WireType;
                    setWireType(next);
                    const preset = WIRE_PRESETS.find((item) => item.type === next);
                    if (preset !== undefined) setBaseUrl(preset.baseUrl);
                  }}
                  className="rounded-control border border-hairline bg-surface px-3 py-2 text-[13px] outline-none focus:border-ink-subtle"
                >
                  {WIRE_PRESETS.map((preset) => (
                    <option key={preset.type} value={preset.type}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] text-ink-muted">Base URL</span>
                <input
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                  }}
                  className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] text-ink-muted">API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                  }}
                  className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
                  placeholder="sk-…"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] text-ink-muted">模型 ID（可选，同时注册）</span>
                <input
                  value={modelId}
                  onChange={(event) => {
                    setModelId(event.target.value);
                  }}
                  className="rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-subtle"
                  placeholder="gpt-4o-mini"
                />
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy || name.trim() === '' || baseUrl.trim() === ''}
                onClick={saveProvider}
                className="rounded-control bg-accent px-3 py-1.5 text-[12px] font-medium text-canvas transition-opacity disabled:opacity-40"
              >
                保存
              </button>
              <button
                type="button"
                disabled={busy || baseUrl.trim() === ''}
                onClick={testProvider}
                className="rounded-control border border-hairline px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                测试连接
              </button>
            </div>

            {message !== null && (
              <p
                className={`mt-2 rounded-control px-3 py-2 text-[12px] ${
                  message.kind === 'ok'
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {message.text}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">
              已配置的 Provider
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {(snapshot?.providers ?? []).length === 0 ? (
                <p className="text-[12px] text-ink-subtle">还没有 Provider。</p>
              ) : (
                (snapshot?.providers ?? []).map((provider) => (
                  <div
                    key={provider.name}
                    className="flex items-center justify-between rounded-card border border-hairline bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px]">{provider.name}</p>
                      <p className="truncate font-mono text-[11px] text-ink-subtle">
                        {provider.wireType} · {provider.baseUrl ?? '-'} ·{' '}
                        {provider.hasApiKey ? 'key 已保存' : '无 key'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void run(
                          async () => {
                            await bridge().provider.remove(provider.name);
                          },
                          `已删除 ${provider.name}`,
                        );
                      }}
                      className="shrink-0 rounded-control px-2 py-1 text-[11px] text-ink-muted transition-colors hover:text-danger"
                    >
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">模型</h3>
            <div className="mt-3 flex flex-col gap-2">
              {(snapshot?.models ?? []).length === 0 ? (
                <p className="text-[12px] text-ink-subtle">还没有模型，先添加 Provider 并填模型 ID。</p>
              ) : (
                (snapshot?.models ?? []).map((model) => {
                  const isDefault = snapshot?.defaultModel === model.alias;
                  return (
                    <div
                      key={model.alias}
                      className="flex items-center justify-between rounded-card border border-hairline bg-surface px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px]">
                          {model.displayName}
                          {isDefault && (
                            <span className="ml-2 text-[10px] tracking-wide text-accent uppercase">
                              默认
                            </span>
                          )}
                        </p>
                        <p className="truncate font-mono text-[11px] text-ink-subtle">
                          {model.alias}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {!isDefault && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              void run(async () => {
                                await bridge().models.setDefault(model.alias);
                              }, '已设为默认模型');
                            }}
                            className="rounded-control px-2 py-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
                          >
                            设为默认
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void run(async () => {
                              await bridge().models.remove(model.alias);
                            }, '已删除模型');
                          }}
                          className="rounded-control px-2 py-1 text-[11px] text-ink-muted transition-colors hover:text-danger"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <McpSettings workDir={workDir} />
        </div>
      </div>
    </div>
  );
}
