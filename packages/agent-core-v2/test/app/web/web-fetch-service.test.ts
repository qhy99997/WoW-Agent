import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { createServices, type TestInstantiationService } from '#/_base/di/test';
import { SERVICES_SECTION, type ServicesConfig } from '#/app/auth/configSection';
import {
  buildAgentIdentitySnapshot,
  IAgentIdentity,
  type AgentIdentitySnapshot,
} from '#/app/agentIdentity/agentIdentity';
import { IConfigService } from '#/app/config/config';
import { ITelemetryService, noopTelemetryService } from '#/app/telemetry/telemetry';
import { LocalFetchURLProvider } from '#/app/web/providers/local-fetch-url';
import { MoonshotFetchURLProvider } from '#/app/web/providers/moonshot-fetch-url';
import { IWebFetchService } from '#/app/web/web';
import { WebFetchService } from '#/app/web/webService';

const HOST_HEADERS = {
  'User-Agent': 'kimi-code-cli/test',
  'X-Msh-Device-Id': 'device-test',
};

describe('WebFetchService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let servicesConfig: ServicesConfig | undefined;
  let identitySlug: string | undefined;

  beforeEach(() => {
    disposables = new DisposableStore();
    servicesConfig = undefined;
    identitySlug = undefined;
    ix = createServices(disposables, {
      additionalServices: (reg) => {
        const snapshot = (): AgentIdentitySnapshot =>
          buildAgentIdentitySnapshot({ slug: identitySlug, hostRequestHeaders: HOST_HEADERS });
        reg.defineInstance(IAgentIdentity, {
          _serviceBrand: undefined,
          resolved: () => Promise.resolve(snapshot()),
          current: snapshot,
        });
        reg.definePartialInstance(IConfigService, {
          get: ((domain: string) =>
            domain === SERVICES_SECTION ? servicesConfig : undefined) as IConfigService['get'],
        });
        reg.defineInstance(ITelemetryService, noopTelemetryService);
        reg.define(IWebFetchService, WebFetchService);
      },
    });
  });

  afterEach(() => {
    disposables.dispose();
    vi.unstubAllGlobals();
  });

  function fetcher(): ReturnType<IWebFetchService['getUrlFetcher']> {
    return ix.get(IWebFetchService).getUrlFetcher();
  }

  it('yields the local fetcher when services.moonshot_fetch is not configured', () => {
    expect(fetcher()).toBeInstanceOf(LocalFetchURLProvider);
  });

  it('builds a Moonshot fetcher from the services.moonshot_fetch api_key config', async () => {
    servicesConfig = {
      moonshotFetch: {
        baseUrl: 'https://fetch.example.com/fetch',
        apiKey: 'fetch-key',
        customHeaders: { 'X-Config': '1' },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'page body',
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(fetcher()).toBeInstanceOf(MoonshotFetchURLProvider);
    const result = await fetcher().fetch('https://example.com/page');

    expect(result).toEqual({ content: 'page body', kind: 'extracted' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://fetch.example.com/fetch');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer fetch-key');
    expect(headers['User-Agent']).toBe('kimi-code-cli/test');
    expect(headers['X-Msh-Device-Id']).toBe('device-test');
    expect(headers['X-Config']).toBe('1');
  });

  it('sends the configured identity to a services-config endpoint', async () => {
    identitySlug = 'acme';
    servicesConfig = {
      moonshotFetch: { baseUrl: 'https://fetch.example.com/fetch', apiKey: 'fetch-key' },
    };
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => 'page body' });
    vi.stubGlobal('fetch', fetchMock);

    await fetcher().fetch('https://example.com/page');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('acme/test');
  });

  it('yields the local fetcher when services.moonshot_fetch has no baseUrl', () => {
    servicesConfig = { moonshotFetch: { apiKey: 'fetch-key' } };
    expect(fetcher()).toBeInstanceOf(LocalFetchURLProvider);
  });
});
