import { Emitter, type Event } from '#/_base/event';
import {
  type ConfigChangedEvent,
  type ConfigDiagnostic,
  type ConfigInspectValue,
  IConfigService,
  type ResolvedConfig,
} from '#/app/config/config';

export class StubConfigService implements IConfigService {
  declare readonly _serviceBrand: undefined;
  readonly ready = Promise.resolve();
  private readonly _onDidChange = new Emitter<ConfigChangedEvent>();
  readonly onDidChangeConfiguration: Event<ConfigChangedEvent> = this._onDidChange.event;
  readonly onDidSectionChange: Event<ConfigChangedEvent> = this._onDidChange.event;
  private readonly _onDidChangeDiagnostics = new Emitter<readonly ConfigDiagnostic[]>();
  readonly onDidChangeDiagnostics: Event<readonly ConfigDiagnostic[]> =
    this._onDidChangeDiagnostics.event;
  private readonly _values = new Map<string, unknown>();

  constructor(initial?: Record<string, unknown>) {
    for (const [domain, value] of Object.entries(initial ?? {})) {
      this._values.set(domain, value);
    }
  }

  get<T = unknown>(domain: string): T {
    return this._values.get(domain) as T;
  }

  inspect<T = unknown>(domain: string): ConfigInspectValue<T> {
    return {
      value: this._values.get(domain) as T | undefined,
      defaultValue: undefined,
      userValue: this._values.get(domain) as T | undefined,
      memoryValue: undefined,
    };
  }

  getAll(): ResolvedConfig {
    return Object.fromEntries(this._values) as ResolvedConfig;
  }

  set(domain: string, patch: unknown): Promise<void> {
    const previousValue = this._values.get(domain);
    const value =
      patch !== null && typeof patch === 'object'
        ? { ...(previousValue as Record<string, unknown> | undefined), ...patch }
        : patch;
    this._values.set(domain, value);
    this._onDidChange.fire({ domain, source: 'set', value, previousValue });
    return Promise.resolve();
  }

  replace(domain: string, value: unknown): Promise<void> {
    const previousValue = this._values.get(domain);
    if (value === undefined || value === null) {
      this._values.delete(domain);
    } else {
      this._values.set(domain, value);
    }
    this._onDidChange.fire({ domain, source: 'set', value, previousValue });
    return Promise.resolve();
  }

  replaceSections(sections: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [domain, value] of Object.entries(sections)) {
      const previousValue = this._values.get(domain);
      if (value === undefined || value === null) {
        this._values.delete(domain);
      } else {
        this._values.set(domain, value);
      }
      this._onDidChange.fire({ domain, source: 'set', value, previousValue });
    }
    return Promise.resolve();
  }

  setSilent(domain: string, value: unknown): void {
    if (value === undefined) {
      this._values.delete(domain);
    } else {
      this._values.set(domain, value);
    }
  }

  reload(): Promise<void> {
    return Promise.resolve();
  }

  diagnostics(): readonly ConfigDiagnostic[] {
    return [];
  }
}
