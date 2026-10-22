import { describe, expect, it } from 'vitest';

import {
  SERVICES_SECTION,
  servicesFromToml,
  servicesToToml,
} from '#/app/auth/configSection';
import { ConfigRegistry } from '#/app/config/configService';

describe('services config section', () => {
  it('registers the services section and validates its schema', () => {
    const registry = new ConfigRegistry();

    expect(registry.getSection(SERVICES_SECTION)).toBeDefined();
    expect(
      registry.validate(SERVICES_SECTION, {
        moonshotFetch: { baseUrl: 'https://api.example.com/fetch', apiKey: 'fetch-key' },
        customService: { baseUrl: 'https://service.example.com', retries: 3 },
      }),
    ).toEqual({
      moonshotFetch: { baseUrl: 'https://api.example.com/fetch', apiKey: 'fetch-key' },
      customService: { baseUrl: 'https://service.example.com', retries: 3 },
    });
    expect(() =>
      registry.validate(SERVICES_SECTION, { moonshotFetch: { baseUrl: 42 } }),
    ).toThrow();
  });

  it('maps services from TOML snake_case to camelCase', () => {
    expect(
      servicesFromToml({
        moonshot_fetch: {
          base_url: 'https://api.example.com/fetch',
          api_key: 'fetch-key',
          custom_headers: { 'X-Fetch': '1' },
        },
      }),
    ).toEqual({
      moonshotFetch: {
        baseUrl: 'https://api.example.com/fetch',
        apiKey: 'fetch-key',
        customHeaders: { 'X-Fetch': '1' },
      },
    });
  });

  it('maps services back to TOML snake_case, preserving unknown entries', () => {
    expect(
      servicesToToml(
        {
          moonshotFetch: {
            baseUrl: 'https://api.example.com/fetch',
            apiKey: 'fetch-key',
            customHeaders: { 'X-Fetch': '1' },
          },
        },
        { custom_service: { base_url: 'https://service.example.com' } },
      ),
    ).toEqual({
      moonshot_fetch: {
        base_url: 'https://api.example.com/fetch',
        api_key: 'fetch-key',
        custom_headers: { 'X-Fetch': '1' },
      },
      custom_service: { base_url: 'https://service.example.com' },
    });
  });
});
