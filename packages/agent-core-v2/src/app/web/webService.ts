import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { SERVICES_SECTION, type ServicesConfig } from '#/app/auth/configSection';
import { IAgentIdentity } from '#/app/agentIdentity/agentIdentity';
import { IConfigService } from '#/app/config/config';
import { ITelemetryService } from '#/app/telemetry/telemetry';

import { LocalFetchURLProvider } from './providers/local-fetch-url';
import { MoonshotFetchURLProvider } from './providers/moonshot-fetch-url';
import type { UrlFetcher } from './tools/fetch-url-types';
import { IWebFetchService } from './web';

export class WebFetchService implements IWebFetchService {
  declare readonly _serviceBrand: undefined;
  private readonly localFetcher: UrlFetcher;

  constructor(
    @IConfigService private readonly config: IConfigService,
    @IAgentIdentity private readonly identity: IAgentIdentity,
    @ITelemetryService private readonly telemetry: ITelemetryService,
  ) {
    this.localFetcher = new LocalFetchURLProvider();
  }

  getUrlFetcher(): UrlFetcher {
    return this.fromServicesConfig() ?? this.localFetcher;
  }

  private fromServicesConfig(): UrlFetcher | undefined {
    const fetchConfig = this.config.get<ServicesConfig>(SERVICES_SECTION)?.moonshotFetch;
    if (fetchConfig?.baseUrl === undefined) {
      return undefined;
    }
    return new MoonshotFetchURLProvider({
      baseUrl: fetchConfig.baseUrl,
      apiKey: nonEmptyString(fetchConfig.apiKey),
      defaultHeaders: { ...this.identity.current().requestHeaders },
      customHeaders: fetchConfig.customHeaders,
      localFallback: this.localFetcher,
      telemetry: this.telemetry,
    });
  }
}

function nonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

registerScopedService(
  LifecycleScope.App,
  IWebFetchService,
  WebFetchService,
  ScopeActivation.OnScopeCreated,
  'web',
);
