import { z } from 'zod';

import {
  type ConfigEffectiveOverlay,
  type ConfigStripEnv,
  type EnvBindings,
  envBindings,
  stripEnvBoundFields,
} from '#/app/config/config';
import { registerConfigOverlay } from '#/app/config/configOverlayContributions';
import { registerConfigSection } from '#/app/config/configSectionContributions';
import {
  camelToSnake,
  cloneRecord,
  isPlainObject,
  setDefined,
  snakeToCamel,
} from '#/app/config/toml';

export const SERVICES_SECTION = 'services';

const StringRecordSchema = z.record(z.string(), z.string());

export const MoonshotServiceConfigSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  customHeaders: StringRecordSchema.optional(),
});

export type MoonshotServiceConfig = z.infer<typeof MoonshotServiceConfigSchema>;

export const ServicesConfigSchema = z
  .object({
    moonshotFetch: MoonshotServiceConfigSchema.optional(),
  })
  .passthrough();

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;

export const WEB_FETCH_BASE_URL_ENV = 'WOW_WEB_FETCH_BASE_URL';
export const WEB_FETCH_API_KEY_ENV = 'WOW_WEB_FETCH_API_KEY';

const nonBlankEnv = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const moonshotFetchEnvBindings = envBindings(MoonshotServiceConfigSchema, {
  baseUrl: { env: WEB_FETCH_BASE_URL_ENV, parse: nonBlankEnv },
  apiKey: { env: WEB_FETCH_API_KEY_ENV, parse: nonBlankEnv },
});

export const servicesEnvBindings: EnvBindings<ServicesConfig> = envBindings(
  ServicesConfigSchema,
  {
    moonshotFetch: moonshotFetchEnvBindings,
  },
);

const servicesCredentialEnvOverlay: ConfigEffectiveOverlay = {
  apply(effective, getEnv, validate) {
    const services = effective[SERVICES_SECTION];
    if (!isPlainObject(services)) return [];
    const moonshotFetch = isolateEnvServiceCredentials(
      services['moonshotFetch'],
      getEnv,
      WEB_FETCH_BASE_URL_ENV,
      WEB_FETCH_API_KEY_ENV,
    );
    if (moonshotFetch === services['moonshotFetch']) return [];
    effective[SERVICES_SECTION] = validate(SERVICES_SECTION, { ...services, moonshotFetch });
    return [SERVICES_SECTION];
  },
};

function isolateEnvServiceCredentials(
  service: unknown,
  getEnv: (name: string) => string | undefined,
  baseUrlEnv: string,
  apiKeyEnv: string,
): unknown {
  const baseUrl = nonBlankEnv(getEnv(baseUrlEnv) ?? '');
  const apiKey = nonBlankEnv(getEnv(apiKeyEnv) ?? '');
  if (baseUrl !== undefined) return { baseUrl, apiKey };
  if (apiKey === undefined) return service;
  if (!isPlainObject(service)) return { apiKey };
  return { ...service, apiKey };
}

const stripMoonshotFetchEnv = stripEnvBoundFields(moonshotFetchEnvBindings);

export const stripServicesEnv: ConfigStripEnv<ServicesConfig> = (value, raw, getEnv) => {
  if (!isPlainObject(value)) return value;
  const entry = value.moonshotFetch;
  if (entry === undefined) return value;
  const stripped = stripMoonshotFetchEnv(
    entry,
    isPlainObject(raw) ? raw['moonshotFetch'] : undefined,
    getEnv,
  );
  if (stripped === entry) return value;
  const out: ServicesConfig = { ...value };
  if (stripped === undefined) {
    delete out.moonshotFetch;
  } else {
    out.moonshotFetch = stripped;
  }
  return out;
};

export const servicesFromToml = (rawSnake: unknown): unknown => {
  if (!isPlainObject(rawSnake)) return rawSnake;
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(rawSnake)) {
    out[snakeToCamel(name)] = isPlainObject(entry) ? serviceEntryFromToml(entry) : entry;
  }
  return out;
};

function serviceEntryFromToml(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = snakeToCamel(key);
    if (targetKey === 'customHeaders') {
      out[targetKey] = isPlainObject(value) ? cloneRecord(value) : value;
    } else {
      out[targetKey] = value;
    }
  }
  return out;
}

export const servicesToToml = (value: unknown, rawSnake: unknown): unknown => {
  if (!isPlainObject(value)) return value;
  const out = cloneRecord(rawSnake);
  writeService(out, 'moonshot_fetch', value['moonshotFetch']);
  return out;
};

function writeService(out: Record<string, unknown>, snakeKey: string, service: unknown): void {
  if (isPlainObject(service)) {
    out[snakeKey] = serviceEntryToToml(service);
  } else {
    delete out[snakeKey];
  }
}

function serviceEntryToToml(service: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(service)) {
    if (key === 'customHeaders' && value !== undefined) {
      out[camelToSnake(key)] = cloneRecord(value);
    } else {
      setDefined(out, camelToSnake(key), value);
    }
  }
  return out;
}

registerConfigSection(SERVICES_SECTION, ServicesConfigSchema, {
  fromToml: servicesFromToml,
  toToml: servicesToToml,
  env: servicesEnvBindings,
  stripEnv: stripServicesEnv,
});
registerConfigOverlay(servicesCredentialEnvOverlay);
