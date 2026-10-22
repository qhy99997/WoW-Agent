export type { DeviceHeaders } from './types';

export {
  assertKimiHostIdentity,
  createKimiDefaultHeaders,
  createKimiDeviceHeaders,
  createKimiDeviceId,
  createKimiUserAgent,
  KIMI_CODE_CUSTOM_HEADERS_ENV,
  KIMI_CODE_PLATFORM,
  parseKimiCodeCustomHeaders,
  readKimiDeviceId,
  replaceUserAgentProduct,
} from './identity';
export type { KimiHostIdentity, KimiIdentityOptions } from './identity';

export {
  apiKeyEnvMissingMessage,
  credentialConflictMessage,
  declaredProviderCredential,
  reconcileProviderCredentialUpdate,
} from './provider-credential';
export type {
  DeclaredProviderCredential,
  ProviderCredentialReconciliation,
  ProviderCredentialUpdate,
  ProviderCredentialView,
} from './provider-credential';

export type { OAuthTokenTransactionOptions } from './oauth-token-transaction';
export { OAuthTokenTransaction } from './oauth-token-transaction';
