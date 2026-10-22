/**
 * Shared provider-credential rules for every layer that reads or rewrites a
 * provider record: the agent-core-v2 runtime (model-auth / catalog) and the
 * provider write routes. The precedence chain (inline `apiKey` vs declared
 * `apiKeyEnv`), the mutual-exclusion conflict, and the user-facing messages
 * live here once so no layer re-derives — and silently diverges on — the same
 * rules.
 */

export interface ProviderCredentialView {
  readonly apiKey?: unknown;
  readonly apiKeyEnv?: unknown;
}

export type DeclaredProviderCredential =
  | { readonly kind: 'inline'; readonly apiKey: string }
  | { readonly kind: 'env'; readonly apiKeyEnv: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict'; readonly message: string };

/**
 * Reads the credential a provider record declares, without resolving any
 * environment variable. Declaring both `apiKey` and `apiKeyEnv` is a conflict
 * the chat path rejects — write paths must not honor a configuration the
 * runtime would refuse.
 */
export function declaredProviderCredential(
  provider: ProviderCredentialView,
  providerName: string,
): DeclaredProviderCredential {
  const inlineApiKey = nonEmptyString(provider.apiKey);
  const apiKeyEnv = nonEmptyString(provider.apiKeyEnv);
  if (inlineApiKey !== undefined && apiKeyEnv !== undefined) {
    return {
      kind: 'conflict',
      message: credentialConflictMessage('Provider', providerName, 'apiKey', 'apiKeyEnv'),
    };
  }
  if (inlineApiKey !== undefined) return { kind: 'inline', apiKey: inlineApiKey };
  if (apiKeyEnv !== undefined) return { kind: 'env', apiKeyEnv };
  return { kind: 'none' };
}

export function credentialConflictMessage(
  kind: string,
  name: string,
  first: string,
  second: string,
): string {
  return `${kind} "${name}" has both ${first} and ${second} set in config.toml - they are mutually exclusive. Remove one.`;
}

export function apiKeyEnvMissingMessage(providerName: string, envName: string): string {
  return `Provider "${providerName}" declares api_key_env = "${envName}" in config.toml, but the environment variable is not set or is empty.`;
}

export interface ProviderCredentialUpdate {
  readonly apiKey?: string;
  readonly apiKeyEnv?: string;
}

export type ProviderCredentialReconciliation =
  | { readonly ok: true; readonly apiKey?: string; readonly apiKeyEnv?: string }
  | { readonly ok: false; readonly message: string };

/**
 * Merges a submitted credential update into a provider's existing credential.
 * Submitted values are trimmed; a non-empty `apiKey` replaces any `apiKeyEnv`
 * (and vice versa), submitting both is a conflict, and an explicit empty/
 * whitespace value clears its own field while an omitted field is preserved.
 */
export function reconcileProviderCredentialUpdate(
  existing: ProviderCredentialUpdate,
  submitted: ProviderCredentialUpdate,
  providerName: string,
): ProviderCredentialReconciliation {
  const key = nonEmptyString(submitted.apiKey);
  const env = nonEmptyString(submitted.apiKeyEnv);
  if (key !== undefined && env !== undefined) {
    return {
      ok: false,
      message: credentialConflictMessage('Provider', providerName, 'apiKey', 'apiKeyEnv'),
    };
  }
  if (env !== undefined) return { ok: true, apiKeyEnv: env };
  if (key !== undefined) return { ok: true, apiKey: key };
  return {
    ok: true,
    apiKey: submitted.apiKey === undefined ? existing.apiKey : undefined,
    apiKeyEnv: submitted.apiKeyEnv === undefined ? existing.apiKeyEnv : undefined,
  };
}

export function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
